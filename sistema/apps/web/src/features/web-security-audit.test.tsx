// Regressions of the front-end security audit (2026-11): office images, WhatsApp links of the
// onboarding and the headers of the local servers.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OnboardingLinkCreated } from '@effinance/shared';
import { localServerHeaders } from '@/lib/csp';
import { safeImageSrc } from '@/lib/image';
import { ContractPrintFlow } from './office/components/contract-preview';
import { openTarget } from './onboarding/components/send-onboarding-dialog';
import { safeLogo, whatsappUrl } from './onboarding/onboarding-logic';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')}`;

describe('office images (logo on the public onboarding page, contracts and letters)', () => {
  it('only base64 PNG/JPEG/WebP data URIs reach <img src>', () => {
    expect(safeImageSrc(PNG)).toBe(PNG);
    expect(safeImageSrc('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ');
    expect(safeImageSrc('data:image/webp;base64,UklGRg==')).toBe('data:image/webp;base64,UklGRg==');
    for (const bad of [
      SVG,
      'data:image/gif;base64,R0lGODlh',
      'data:text/html;base64,PHNjcmlwdD4=',
      'https://tracker.example/pixel.png',
      '//tracker.example/p.png',
      'javascript:alert(1)',
      'blob:https://app.efficio.com.br/1',
      `${PNG}" onerror="alert(1)`,
      'DATA:IMAGE/PNG;base64,AAAA',
      '',
      null,
      undefined,
    ]) {
      expect(safeImageSrc(bad)).toBeNull();
    }
  });

  it('the onboarding deck no longer accepts SVG or GIF logos', () => {
    expect(safeLogo(SVG)).toBeNull();
    expect(safeLogo('data:image/gif;base64,R0lGODlh')).toBeNull();
    expect(safeLogo(PNG)).toBe(PNG);
  });

  it('the printed contract drops a logo or watermark that is not a safe image', () => {
    const blocks = [{ type: 'paragraph' as const, text: '<img src=x onerror=alert(1)>' }];
    const html = renderToStaticMarkup(
      <ContractPrintFlow blocks={blocks} logo="https://tracker.example/l.png" watermark={SVG} />,
    );
    expect(html).not.toContain('tracker.example');
    expect(html).not.toContain('svg+xml');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const ok = renderToStaticMarkup(<ContractPrintFlow blocks={blocks} logo={PNG} watermark={PNG} />);
    expect(ok.match(/<img/g)).toHaveLength(2);
  });
});

describe('WhatsApp link of the onboarding', () => {
  const created: OnboardingLinkCreated = {
    id: 'l1',
    path: '/o/abc',
    url: 'https://app.efficio.com.br/o/abc',
    channel: 'whatsapp',
    expiresAt: '2026-12-18T12:00:00Z',
    to: '5519998765432',
    recipientName: 'Marina',
    message: '',
  };

  it('never builds wa.me without a valid number (the contact picker would let the token go to anyone)', () => {
    expect(whatsappUrl('', 'oi')).toBeNull();
    expect(whatsappUrl('abc', 'oi')).toBeNull();
    expect(whatsappUrl('123', 'oi')).toBeNull();
    expect(whatsappUrl('55199987654321234', 'oi')).toBeNull();
    expect(openTarget({ ...created, to: '' }, 'Veja {{link}}', 'Onboarding')).toBeNull();
  });

  it('encodes the message so it cannot add parameters or change the number', () => {
    const url = whatsappUrl('+55 (19) 99876-5432', 'a&phone=5511999999999#x\n?text=b')!;
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://wa.me');
    expect(parsed.pathname).toBe('/5519998765432');
    expect([...parsed.searchParams.keys()]).toEqual(['text']);
    expect(parsed.searchParams.get('text')).toBe('a&phone=5511999999999#x\n?text=b');
    expect(parsed.hash).toBe('');
  });
});

describe('local servers (vite dev/preview) send the production anti-framing headers', () => {
  it('dev: no framing, no MIME sniffing, same-origin referrer', () => {
    const h = localServerHeaders();
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('same-origin');
    expect(h['Permissions-Policy']).toContain('camera=()');
    expect(h['Content-Security-Policy']).toBeUndefined();
  });

  it("preview: frame-ancestors 'none' (a <meta> CSP cannot carry it)", () => {
    expect(localServerHeaders({ preview: true })['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
});
