// The office that runs the workspace and its contract template (spec §13.9, Effy's Office): one row per
// workspace. `office` reads and writes everything; every member reads the name and the logo (headers of
// the PDFs). The responsible's CPF, e-mail and phone and the Pix key are encrypted with the workspace
// key; logo and watermark are images checked by signature (PNG, JPG, WebP up to 500 KB, never SVG).
// The template is a list of blocks; `null` means the factory template (CONTRACT_FACTORY_BLOCKS in
// packages/shared) and the watermark `null` the factory watermark, so "voltar ao modelo de fábrica" is
// an UPDATE to null, saved right away (Effy's lesson). The contract of a client is filled by the API
// with `contractValues`/`fillContractBlocks` and comes with the list of what is missing.

import { and, eq, sql } from 'drizzle-orm';
import {
  CONTRACT_FACTORY_BLOCKS,
  CONTRACT_FACTORY_VERSION,
  CONTRACT_FACTORY_WATERMARK,
  contractValues,
  fillContractBlocks,
  MAX_OFFICE_IMAGE_BYTES,
  placeholdersIn,
  type ClientContractResponse,
  type ContractBlock,
  type ContractRequirements,
  type ContractTemplateResponse,
  type Office,
  type OfficeBranding,
  type OfficeContractSummary,
  type contractTemplateInputSchema,
  type officeInputSchema,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, offices, type OfficeRow } from '../../db/schema';
import { now } from '../../lib/clock';
import { InvalidTextError, NotFoundError } from '../../lib/errors';
import { decodeImageDataUri, toDataUri } from '../../lib/images';
import type { ScopedContext } from '../../lib/scoped-context';
import { listFees } from '../clients/service';

type OfficeInput = z.output<typeof officeInputSchema>;
type TemplateInput = z.output<typeof contractTemplateInputSchema>;
type Ctx = Pick<ScopedContext, 'db' | 'workspaceId' | 'cipher' | 'today'>;
type WriteCtx = Ctx & Pick<ScopedContext, 'userId' | 'userName'>;

const TABLE = 'offices';
const ENCRYPTED = ['responsibleDocument', 'responsibleEmail', 'responsiblePhone', 'pixKey'] as const;
const TOO_LARGE = 'A imagem passa de 500 KB.';

async function officeRow(ctx: Ctx): Promise<OfficeRow | null> {
  const [row] = await ctx.db.select().from(offices).where(eq(offices.workspaceId, ctx.workspaceId));
  return row ?? null;
}

/** Creates the office row when missing (concurrent creators converge on the unique index). */
async function ensureOfficeRow(ctx: Ctx): Promise<void> {
  await ctx.db.insert(offices).values({ workspaceId: ctx.workspaceId }).onConflictDoNothing();
}

const logoOf = (row: OfficeRow | null) => (row?.logo && row.logoType ? toDataUri(row.logoType, row.logo) : null);

export async function getBranding(ctx: Ctx): Promise<OfficeBranding> {
  const row = await officeRow(ctx);
  return {
    name: row?.tradeName?.trim() ? row.tradeName : (row?.legalName ?? null),
    legalName: row?.legalName ?? null,
    logo: logoOf(row),
    registered: Boolean(row?.legalName && row.document),
  };
}

function contractSummary(row: OfficeRow | null): OfficeContractSummary {
  return {
    source: row?.contractBlocks ? 'custom' : 'factory',
    factoryVersion: CONTRACT_FACTORY_VERSION,
    updatedAt: row?.contractUpdatedAt?.toISOString() ?? null,
    updatedBy: row?.contractUpdatedByName ? { id: row.contractUpdatedBy, name: row.contractUpdatedByName } : null,
    watermark: { enabled: row?.contractWatermarkEnabled ?? true, source: row?.contractWatermark ? 'custom' : 'factory' },
  };
}

const blocksOf = (row: OfficeRow | null): readonly ContractBlock[] => row?.contractBlocks ?? CONTRACT_FACTORY_BLOCKS;

/** Office fields the contract needs and are blank (labels in pt-BR). */
function officeRequirements(office: Office | null, blocks: readonly ContractBlock[]): string[] {
  if (!office?.registered) return ['Cadastro do escritório'];
  const fields: [keyof Office, string][] = [
    ['legalName', 'Razão social'],
    ['document', 'CNPJ'],
    ['street', 'Logradouro'],
    ['number', 'Número'],
    ['district', 'Bairro'],
    ['city', 'Cidade'],
    ['state', 'UF'],
    ['zipCode', 'CEP'],
    ['responsibleName', 'Nome do responsável'],
    ['responsibleDocument', 'CPF do responsável'],
  ];
  const missing = fields.filter(([k]) => !office[k]).map(([, label]) => label);
  const usesPix = blocks.some((b) => placeholdersIn(b.text).includes('[CHAVE PIX ESCRITORIO]'));
  if (usesPix && !office.pixKey) missing.push('Chave Pix');
  return missing;
}

async function toOffice(ctx: Ctx, row: OfficeRow | null): Promise<Office> {
  const plain = row ? await ctx.cipher.decryptFields(TABLE, row, ENCRYPTED) : null;
  const office: Office = {
    registered: Boolean(row?.legalName && row.document),
    document: row?.document ?? null,
    legalName: row?.legalName ?? null,
    tradeName: row?.tradeName ?? null,
    stateRegistration: row?.stateRegistration ?? null,
    municipalRegistration: row?.municipalRegistration ?? null,
    zipCode: row?.zipCode ?? null,
    street: row?.street ?? null,
    number: row?.number ?? null,
    complement: row?.complement ?? null,
    district: row?.district ?? null,
    city: row?.city ?? null,
    state: row?.state ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
    responsibleName: row?.responsibleName ?? null,
    responsibleDocument: plain?.responsibleDocument ?? null,
    responsibleEmail: plain?.responsibleEmail ?? null,
    responsiblePhone: plain?.responsiblePhone ?? null,
    pixKeyType: row?.pixKeyType ?? null,
    pixKey: plain?.pixKey ?? null,
    logo: logoOf(row),
    missingForContract: [],
    contract: contractSummary(row),
    updatedAt: row?.updatedByName ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedByName ? { id: row.updatedBy, name: row.updatedByName } : null,
  };
  office.missingForContract = officeRequirements(office, blocksOf(row));
  return office;
}

export async function getOffice(ctx: Ctx): Promise<Office> {
  return toOffice(ctx, await officeRow(ctx));
}

export async function saveOffice(ctx: WriteCtx, input: OfficeInput): Promise<Office> {
  await ensureOfficeRow(ctx);
  const values = await ctx.cipher.encryptFields(TABLE, input, ENCRYPTED);
  await ctx.db
    .update(offices)
    .set({ ...values, updatedBy: ctx.userId, updatedByName: ctx.userName })
    .where(eq(offices.workspaceId, ctx.workspaceId));
  return getOffice(ctx);
}

/** Sets (or, with null, removes) the logo. */
export async function setLogo(ctx: WriteCtx, logo: string | null): Promise<OfficeBranding> {
  const image = logo ? decodeImageDataUri(logo, MAX_OFFICE_IMAGE_BYTES, TOO_LARGE) : null;
  await ensureOfficeRow(ctx);
  await ctx.db
    .update(offices)
    .set({ logo: image?.bytes ?? null, logoType: image?.type ?? null, updatedBy: ctx.userId, updatedByName: ctx.userName })
    .where(eq(offices.workspaceId, ctx.workspaceId));
  return getBranding(ctx);
}

function toTemplate(row: OfficeRow | null): ContractTemplateResponse {
  return {
    ...contractSummary(row),
    blocks: [...blocksOf(row)].map((b) => ({ ...b })),
    watermarkImage:
      row?.contractWatermark && row.contractWatermarkType
        ? toDataUri(row.contractWatermarkType, row.contractWatermark)
        : CONTRACT_FACTORY_WATERMARK,
  };
}

export async function getContractTemplate(ctx: Ctx): Promise<ContractTemplateResponse> {
  return toTemplate(await officeRow(ctx));
}

/** Saves what was sent (absent = keep; `blocks: null` = factory template; `watermark: null` = factory). */
export async function saveContractTemplate(ctx: WriteCtx, input: TemplateInput): Promise<ContractTemplateResponse> {
  if (input.blocks?.some((b) => b.text?.includes('\u0000'))) throw new InvalidTextError();
  const watermark =
    input.watermark === undefined
      ? undefined
      : input.watermark === null
        ? null
        : decodeImageDataUri(input.watermark, MAX_OFFICE_IMAGE_BYTES, TOO_LARGE);
  await ensureOfficeRow(ctx);
  await ctx.db
    .update(offices)
    .set({
      ...(input.blocks !== undefined
        ? { contractBlocks: input.blocks === null ? null : input.blocks.map((b) => ({ type: b.type, ...(b.text !== undefined ? { text: b.text } : {}), ...(b.rule ? { rule: b.rule } : {}) })) }
        : {}),
      ...(watermark !== undefined ? { contractWatermark: watermark?.bytes ?? null, contractWatermarkType: watermark?.type ?? null } : {}),
      ...(input.watermarkEnabled !== undefined ? { contractWatermarkEnabled: input.watermarkEnabled } : {}),
      contractUpdatedAt: now(),
      contractUpdatedBy: ctx.userId,
      contractUpdatedByName: ctx.userName,
    })
    .where(eq(offices.workspaceId, ctx.workspaceId));
  return getContractTemplate(ctx);
}

/** "Voltar ao modelo de fábrica": the edited text and the custom watermark are discarded now. */
export async function resetContractTemplate(ctx: WriteCtx): Promise<ContractTemplateResponse> {
  await ensureOfficeRow(ctx);
  await ctx.db
    .update(offices)
    .set({
      contractBlocks: null,
      contractWatermark: null,
      contractWatermarkType: null,
      contractWatermarkEnabled: true,
      contractUpdatedAt: now(),
      contractUpdatedBy: ctx.userId,
      contractUpdatedByName: ctx.userName,
    })
    .where(eq(offices.workspaceId, ctx.workspaceId));
  return getContractTemplate(ctx);
}

/**
 * Everything to print the contract of a client (permission `finance`): the template in use with the
 * fields filled (the discount clause only when the fee period in force has a discount), the watermark,
 * the office's name and logo, and what is missing — client registry, fee period covering today, office.
 */
export async function clientContract(ctx: Ctx, clientId: string): Promise<ClientContractResponse> {
  const [client] = await ctx.db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.id, clientId), eq(contacts.kind, 'client')));
  if (!client) throw new NotFoundError('Cliente não encontrado');
  const [row, fees] = await Promise.all([officeRow(ctx), listFees(ctx.db, ctx.workspaceId, clientId)]);
  const office = await toOffice(ctx, row);
  const plain = await ctx.cipher.decryptFields('contacts', client, ['document', 'street', 'number', 'district', 'zipCode', 'responsibleName', 'responsibleDocument']);
  const current = fees.current;
  const fee = current
    ? { amount: current.amount, employeeFee: current.employeeFee, dueDay: client.feeDueDay ?? 10, discountBps: current.discountBps, startDate: current.startDate, endDate: current.endDate }
    : null;
  const blocks = blocksOf(row);

  const clientFields: [string | null, string][] = [
    [plain.street, 'Logradouro'],
    [plain.number, 'Número'],
    [plain.district, 'Bairro'],
    [client.city, 'Cidade'],
    [client.state, 'UF'],
    [plain.zipCode, 'CEP'],
    [plain.responsibleName, 'Responsável (sócio administrador)'],
    [plain.responsibleDocument, 'CPF do responsável'],
  ];
  const missing: ContractRequirements = {
    client: clientFields.filter(([v]) => !v).map(([, label]) => label),
    fee: fee ? [] : ['Nenhuma vigência cobre hoje'],
    office: office.missingForContract,
  };
  const values = contractValues(
    {
      name: client.name,
      document: plain.document ?? '',
      street: plain.street,
      number: plain.number,
      district: plain.district,
      city: client.city,
      state: client.state,
      zipCode: plain.zipCode,
      responsibleName: plain.responsibleName,
      responsibleDocument: plain.responsibleDocument,
      contractStartDate: client.contractStartDate!,
    },
    office.registered
      ? {
          legalName: office.legalName!,
          document: office.document!,
          street: office.street,
          number: office.number,
          complement: office.complement,
          district: office.district,
          city: office.city,
          state: office.state,
          zipCode: office.zipCode,
          responsibleName: office.responsibleName,
          responsibleDocument: office.responsibleDocument,
          pixKey: office.pixKey,
        }
      : null,
    fee,
  );
  const enabled = row?.contractWatermarkEnabled ?? true;
  return {
    ready: missing.client.length + missing.fee.length + missing.office.length === 0,
    missing,
    client: { id: client.id, name: client.tradeName?.trim() ? client.tradeName : client.name, legalName: client.name },
    fee,
    template: { source: row?.contractBlocks ? 'custom' : 'factory', factoryVersion: CONTRACT_FACTORY_VERSION, updatedAt: row?.contractUpdatedAt?.toISOString() ?? null },
    blocks: fillContractBlocks(blocks, values, { withDiscount: Boolean(fee && fee.discountBps > 0) }),
    values,
    watermark: {
      enabled,
      image: enabled
        ? row?.contractWatermark && row.contractWatermarkType
          ? toDataUri(row.contractWatermarkType, row.contractWatermark)
          : CONTRACT_FACTORY_WATERMARK
        : null,
    },
    office: { name: office.tradeName?.trim() ? office.tradeName : office.legalName, legalName: office.legalName, logo: office.logo, registered: office.registered },
  };
}

/** Version of the template in use (recorded with each contract issued). */
export async function templateVersion(ctx: Ctx): Promise<{ source: 'factory' | 'custom'; version: string }> {
  const [row] = await ctx.db
    .select({ custom: sql<boolean>`${offices.contractBlocks} is not null`, updatedAt: offices.contractUpdatedAt })
    .from(offices)
    .where(eq(offices.workspaceId, ctx.workspaceId));
  return row?.custom
    ? { source: 'custom', version: row.updatedAt?.toISOString() ?? 'custom' }
    : { source: 'factory', version: CONTRACT_FACTORY_VERSION };
}
