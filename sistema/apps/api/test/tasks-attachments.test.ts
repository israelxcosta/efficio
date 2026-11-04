// Task attachments (phase 2): stored in the database encrypted with the workspace key (bound to the
// attachment id), name encrypted, the type checked against the file's signature (a disguised HTML is
// refused), ZIP-based files read through their central directory (declared expansion capped), 10 MB
// per file and 50 MB per task, downloads always as attachments (nosniff, sandboxing CSP), removal by
// the uploader or an administrator, the history, and ids of other workspaces "not found".

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK, MAX_WORKSPACE_ATTACHMENT_BYTES } from '@effinance/shared';
import type { App } from '../src/app';
import { taskAttachments } from '../src/db/schema';
import { executeRows } from '../src/lib/sql';
import { attachmentLimits } from '../src/modules/tasks/attachments';
import { csvCell } from '../src/modules/tasks/csv';
import { attachmentProblem, contentDisposition, MAX_UNCOMPRESSED_BYTES, readZipDirectory } from '../src/modules/tasks/file-check';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { member, office, PDF_BASE64 } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

/** A ZIP with stored entries; `declared` overrides the uncompressed size written in the central directory. */
function zip(entries: { name: string; data: Uint8Array; declared?: number }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.declared ?? e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, e.data);
    central.push(cd);
    offset += local.length + e.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of all) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

const bytes = (text: string) => new TextEncoder().encode(text);
const b64 = (data: Uint8Array) => Buffer.from(data).toString('base64');

async function upload(c: Client, taskId: string, fileName: string, contentType: string, content: string) {
  return c.post(`/tasks/${taskId}/attachments`, { fileName, contentType, content });
}

describe('attachment checks (pure)', () => {
  it('accepts real files and refuses disguised ones', () => {
    const pdf = Buffer.from(PDF_BASE64, 'base64');
    expect(attachmentProblem('guia.pdf', 'application/pdf', pdf)).toBeNull();
    // HTML posing as a PDF, a PDF with the wrong extension.
    expect(attachmentProblem('guia.pdf', 'application/pdf', bytes('<html><script>alert(1)</script></html>'))).toMatch(/não corresponde/);
    expect(attachmentProblem('guia.html', 'application/pdf', pdf)).toMatch(/extensão/);
    expect(attachmentProblem('foto.png', 'image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBeNull();
    expect(attachmentProblem('foto.jpg', 'image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    // XML: an NF-e passes; SVG or XHTML do not.
    expect(attachmentProblem('nfe.xml', 'application/xml', bytes('﻿<?xml version="1.0"?><nfeProc><NFe/></nfeProc>'))).toBeNull();
    expect(attachmentProblem('x.xml', 'application/xml', bytes('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toMatch(/não corresponde/);
    expect(attachmentProblem('x.xml', 'application/xml', bytes('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"/>'))).toMatch(/não corresponde/);
    // Text: no NUL bytes, no markup.
    expect(attachmentProblem('notas.txt', 'text/plain', bytes('Pedir as notas de setembro'))).toBeNull();
    expect(attachmentProblem('notas.txt', 'text/plain', Uint8Array.from([0x41, 0, 0x42]))).toMatch(/não corresponde/);
    expect(attachmentProblem('x.csv', 'text/csv', bytes('<!DOCTYPE html><p>oi</p>'))).toMatch(/não corresponde/);
  });

  it('reads ZIPs through the central directory: expansion capped, Office parts required', () => {
    const small = zip([{ name: 'a.txt', data: bytes('oi') }]);
    expect(readZipDirectory(small)).toMatchObject({ entries: 1, uncompressed: 2, names: ['a.txt'] });
    expect(attachmentProblem('a.zip', 'application/zip', small)).toBeNull();
    const bomb = zip([
      { name: 'a.bin', data: bytes('x'), declared: MAX_UNCOMPRESSED_BYTES },
      { name: 'b.bin', data: bytes('x'), declared: 10 },
    ]);
    expect(attachmentProblem('a.zip', 'application/zip', bomb)).toMatch(/expande/);
    expect(attachmentProblem('a.zip', 'application/zip', bytes('PK\u0003\u0004 truncated'))).toMatch(/corrompido/);
    const docx = zip([
      { name: '[Content_Types].xml', data: bytes('<Types/>') },
      { name: 'word/document.xml', data: bytes('<w:document/>') },
    ]);
    expect(attachmentProblem('contrato.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx)).toBeNull();
    // A plain ZIP renamed to .xlsx is not a spreadsheet.
    expect(attachmentProblem('planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', small)).toMatch(/não corresponde/);
  });

  it('refuses ZIP entries that would escape the folder they are extracted to (zip slip)', () => {
    // Security review: the server never extracts, but whoever downloads the file does.
    for (const name of ['../../etc/cron.d/x', 'docs/../../x.txt', '/etc/passwd', '..\\..\\Windows\\x.bat', 'C:\\x.bat', 'C:/x.bat']) {
      const evil = zip([{ name: 'ok.txt', data: bytes('oi') }, { name, data: bytes('x') }]);
      expect(attachmentProblem('a.zip', 'application/zip', evil), name).toMatch(/caminho/);
    }
    // Names after the first 200 entries are checked too.
    const many = zip([...Array.from({ length: 205 }, (_, i) => ({ name: `f${i}.txt`, data: bytes('x') })), { name: '../x', data: bytes('x') }]);
    expect(attachmentProblem('a.zip', 'application/zip', many)).toMatch(/caminho/);
    // Ordinary names (folders, dots inside names, Windows separators) stay accepted.
    const fine = zip([{ name: 'pasta/sub/a..b.txt', data: bytes('x') }, { name: 'pasta\\b.txt', data: bytes('x') }, { name: '.oculto', data: bytes('x') }]);
    expect(attachmentProblem('a.zip', 'application/zip', fine)).toBeNull();
  });

  it('writes safe headers and CSV cells', () => {
    expect(contentDisposition('Guia "DAS" ç.pdf')).toBe(`attachment; filename="Guia _DAS_ c.pdf"; filename*=UTF-8''Guia%20%22DAS%22%20%C3%A7.pdf`);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell(null)).toBe('');
  });
});

describe('task attachments', () => {
  it('stores the file encrypted, serves it as a download and keeps the history', async () => {
    const { ana, carla } = await office(app);
    const dani = await member(app, ana, 'viewer', 'Daniela Lima');
    const task = (await carla.post('/tasks', { title: 'Guia do DAS' })).body;

    const res = await upload(carla, task.id, '../../Guia DAS outubro.pdf', 'application/pdf', PDF_BASE64);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const file = res.body;
    expect(file).toMatchObject({
      fileName: 'Guia DAS outubro.pdf',
      contentType: 'application/pdf',
      sizeBytes: Buffer.from(PDF_BASE64, 'base64').length,
      uploadedBy: { id: carla.userId, name: 'Carla Souza' },
      canDelete: true,
    });
    // At rest: the name and the content are ciphertext (12-byte IV + 16-byte tag around the file).
    const [row] = await admin().select().from(taskAttachments).where(eq(taskAttachments.id, file.id));
    expect(row!.fileName).toMatch(/^v1\./);
    expect(Buffer.from(row!.content).includes(Buffer.from('%PDF'))).toBe(false);
    expect(row!.content.length).toBe(file.sizeBytes + 28);

    const detail = (await dani.get(`/tasks/${task.id}`)).body;
    expect(detail.attachmentCount).toBe(1);
    expect(detail.attachments).toEqual([{ ...file, canDelete: false }]);
    expect((await carla.get(`/tasks/${task.id}/attachments`)).body).toHaveLength(1);

    const download = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/attachments/${file.id}/download`,
      headers: { authorization: `Bearer ${dani.token}` },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toBe(`attachment; filename="Guia DAS outubro.pdf"; filename*=UTF-8''Guia%20DAS%20outubro.pdf`);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.rawPayload.equals(Buffer.from(PDF_BASE64, 'base64'))).toBe(true);

    // A content copied onto another attachment does not decrypt (bound to the attachment id).
    const other = (await upload(carla, task.id, 'outra.pdf', 'application/pdf', PDF_BASE64)).body;
    await admin().update(taskAttachments).set({ content: row!.content }).where(eq(taskAttachments.id, other.id));
    const swapped = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/attachments/${other.id}/download`,
      headers: { authorization: `Bearer ${carla.token}` },
    });
    expect(swapped.statusCode).toBe(500);
    expect(swapped.body).not.toContain('PDF');

    // Removing: the uploader or an administrator; the history keeps the name (decrypted for members).
    expect((await dani.del(`/tasks/${task.id}/attachments/${file.id}`)).status).toBe(403);
    expect((await ana.del(`/tasks/${task.id}/attachments/${other.id}`)).status).toBe(204);
    expect((await carla.del(`/tasks/${task.id}/attachments/${file.id}`)).status).toBe(204);
    const history = (await carla.get(`/tasks/${task.id}/history`)).body.items;
    expect(history.slice(0, 4).map((h: any) => [h.kind, h.note])).toEqual([
      ['attachment_removed', 'Guia DAS outubro.pdf'],
      ['attachment_removed', 'outra.pdf'],
      ['attachment_added', 'outra.pdf'],
      ['attachment_added', 'Guia DAS outubro.pdf'],
    ]);
    const notes = await executeRows<{ note: string }>(admin(), sql`select note from task_events where task_id = ${task.id} and note is not null`);
    expect(notes.every((n) => n.note.startsWith('v1.'))).toBe(true);
  });

  it('refuses disguised, oversized and unknown files', async () => {
    const { carla } = await office(app);
    const task = (await carla.post('/tasks', { title: 'Documentos' })).body;
    const html = b64(bytes('<html><body><script>alert(document.cookie)</script></body></html>'));
    expect((await upload(carla, task.id, 'guia.pdf', 'application/pdf', html)).body.message).toBe('O conteúdo do arquivo não corresponde ao tipo informado.');
    expect((await upload(carla, task.id, 'imagem.svg', 'image/svg+xml', b64(bytes('<svg/>')))).status).toBe(400);
    expect((await upload(carla, task.id, 'pagina.html', 'text/html', html)).status).toBe(400);
    expect((await upload(carla, task.id, 'guia.exe', 'application/pdf', PDF_BASE64)).status).toBe(422);
    const bomb = zip([{ name: 'a.bin', data: bytes('x'), declared: 0xfffffffe }]);
    expect((await upload(carla, task.id, 'a.zip', 'application/zip', b64(bomb))).body.message).toMatch(/expande/);
    // More than 10 MB of file.
    const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0x41);
    big.write('%PDF-', 0);
    expect((await upload(carla, task.id, 'grande.pdf', 'application/pdf', big.toString('base64'))).body.message).toBe('O arquivo passa de 10 MB.');
    // Far above it, the contract refuses the body before anything is decoded.
    const huge = Buffer.alloc(MAX_ATTACHMENT_BYTES + 4096, 0x41).toString('base64');
    expect((await upload(carla, task.id, 'grande.pdf', 'application/pdf', huge)).status).toBe(400);
    expect((await carla.get(`/tasks/${task.id}/attachments`)).body).toEqual([]);
  });

  it('malformed base64 is the client\'s error (422), never a 500', async () => {
    // Security review: characters of the alphabet with an impossible length passed the contract and
    // made `atob` throw, answered as an unexpected error (500, logged as one).
    const { carla } = await office(app);
    const task = (await carla.post('/tasks', { title: 'Documentos' })).body;
    for (const content of ['AAAAA', 'JVBERi0tA', 'AB=']) {
      const res = await upload(carla, task.id, 'guia.pdf', 'application/pdf', content);
      expect([400, 422], `${content}: ${res.status} ${JSON.stringify(res.body)}`).toContain(res.status);
    }
    const res = await upload(carla, task.id, 'guia.pdf', 'application/pdf', 'AAAAA');
    expect(res).toMatchObject({ status: 422, body: { message: 'Conteúdo do arquivo inválido.' } });
    expect((await carla.get(`/tasks/${task.id}/attachments`)).body).toEqual([]);
  });

  it('a task holds up to 50 MB of attachments', async () => {
    const { carla } = await office(app);
    const task = (await carla.post('/tasks', { title: 'Muitos arquivos' })).body;
    const file = Buffer.alloc(MAX_ATTACHMENT_BYTES, 0x41);
    file.write('%PDF-', 0);
    const content = file.toString('base64');
    for (let i = 0; i < 5; i++) expect((await upload(carla, task.id, `parte-${i}.pdf`, 'application/pdf', content)).status).toBe(201);
    const over = await upload(carla, task.id, 'mais.pdf', 'application/pdf', PDF_BASE64);
    expect(over).toMatchObject({ status: 422, body: { message: 'Esta tarefa chegou ao limite de 50 MB de anexos. Remova algum antes de anexar outro.' } });
  }, 120_000);

  it('concurrent uploads never pass the per-task limit (serialized in the transaction)', async () => {
    const { carla } = await office(app);
    const task = (await carla.post('/tasks', { title: 'Corrida' })).body;
    for (let i = 0; i < MAX_ATTACHMENTS_PER_TASK - 2; i++) {
      expect((await upload(carla, task.id, `guia-${i}.pdf`, 'application/pdf', PDF_BASE64)).status).toBe(201);
    }
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => upload(carla, task.id, `extra-${i}.pdf`, 'application/pdf', PDF_BASE64)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 422, 422, 422]);
    expect((await carla.get(`/tasks/${task.id}/attachments`)).body).toHaveLength(MAX_ATTACHMENTS_PER_TASK);
  }, 120_000);

  it('the workspace has a quota (2 GB), checked without races', async () => {
    expect(MAX_WORKSPACE_ATTACHMENT_BYTES).toBe(2 * 1024 ** 3);
    const { carla } = await office(app);
    const size = Buffer.from(PDF_BASE64, 'base64').length;
    const tasks = await Promise.all(Array.from({ length: 5 }, (_, i) => carla.post('/tasks', { title: `T${i}` }).then((r) => r.body.id as string)));
    const previous = attachmentLimits.workspaceBytes;
    attachmentLimits.workspaceBytes = size * 3;
    try {
      const results = await Promise.all(tasks.map((id) => upload(carla, id, 'guia.pdf', 'application/pdf', PDF_BASE64)));
      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 422, 422]);
      expect(results.find((r) => r.status === 422)!.body.message).toBe(
        'O escritório chegou ao limite de armazenamento de anexos. Remova anexos antigos antes de anexar outro.',
      );
    } finally {
      attachmentLimits.workspaceBytes = previous;
    }
  }, 60_000);

  it('ids of another workspace or of another task are "not found"', async () => {
    const { carla } = await office(app);
    const task = (await carla.post('/tasks', { title: 'A' })).body;
    const otherTask = (await carla.post('/tasks', { title: 'B' })).body;
    const file = (await upload(carla, task.id, 'guia.pdf', 'application/pdf', PDF_BASE64)).body;
    const stranger = await registerUser(app, 'Outro Escritório');
    expect((await stranger.get(`/tasks/${task.id}/attachments`)).status).toBe(404);
    expect((await stranger.get(`/tasks/${task.id}/attachments/${file.id}/download`)).status).toBe(404);
    expect((await stranger.del(`/tasks/${task.id}/attachments/${file.id}`)).status).toBe(404);
    expect((await upload(stranger, task.id, 'x.pdf', 'application/pdf', PDF_BASE64)).status).toBe(404);
    expect((await carla.get(`/tasks/${otherTask.id}/attachments/${file.id}/download`)).status).toBe(404);
  });
});
