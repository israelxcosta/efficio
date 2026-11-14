import { useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { MfaSetupResponse } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { saveBlob } from '@/lib/api';
import { copyText } from '@/lib/clipboard';

// Pieces of the two-step verification enrollment, shared by Configurações → Segurança and the
// mandatory enrollment screen.

/** Groups the base32 secret in blocks of 4 for manual typing. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export function MfaStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">{n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </section>
  );
}

/** QR code for the authenticator app plus the key for manual entry. */
export function MfaQrCode({ data, stacked }: { data: MfaSetupResponse; stacked?: boolean }) {
  return (
    <div className={stacked ? 'mt-3 flex flex-col items-center gap-3' : 'mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start'}>
      {/* White quiet zone so the code stays scannable in the dark theme. */}
      <div className="rounded-xl border border-border bg-white p-3">
        <QRCodeSVG value={data.otpauthUrl} size={168} level="M" title="QR code para o aplicativo autenticador" />
      </div>
      <div className={stacked ? 'min-w-0 text-center text-[13px] text-muted' : 'min-w-0 text-[13px] text-muted'}>
        <p>Não consegue escanear? Digite esta chave no aplicativo:</p>
        <div className={stacked ? 'mt-2 flex items-center justify-center gap-2' : 'mt-2 flex items-center gap-2'}>
          <code className="tabular rounded-md bg-bg-subtle px-2.5 py-1.5 text-[13px] font-semibold tracking-wider break-all text-fg">
            {formatSecret(data.secret)}
          </code>
          <CopyButton text={data.secret} label="Copiar chave" />
        </div>
      </div>
    </div>
  );
}

/** Text of the downloaded recovery codes file. */
export function recoveryCodesFile(codes: string[]): string {
  return [
    'Efficio: códigos de recuperação da verificação em duas etapas',
    'Cada código funciona uma única vez, caso você perca o acesso ao aplicativo autenticador.',
    '',
    ...codes,
    '',
  ].join('\n');
}

export function RecoveryCodes({ codes, saved, onSavedChange }: { codes: string[]; saved: boolean; onSavedChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-muted p-4" aria-label="Códigos de recuperação">
        {codes.map((c) => (
          <li key={c} className="tabular rounded-md bg-surface px-3 py-2 text-center font-mono text-sm font-semibold tracking-wider">
            {c}
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <CopyButton text={codes.join('\n')} label="Copiar códigos" full />
        <Button
          variant="outline"
          onClick={() => saveBlob(new Blob([recoveryCodesFile(codes)], { type: 'text/plain;charset=utf-8' }), 'efficio-codigos-de-recuperacao.txt')}
        >
          <Download /> Baixar .txt
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-fg">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--app-primary)]" checked={saved} onChange={(e) => onSavedChange(e.target.checked)} />
        Guardei os códigos em um local seguro (gerenciador de senhas ou papel guardado).
      </label>
    </div>
  );
}

export function CopyButton({ text, label, full }: { text: string; label: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={full ? 'md' : 'icon-sm'}
      aria-label={label}
      title={label}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } else toast.error('Não foi possível copiar. Selecione e copie manualmente.');
      }}
    >
      {copied ? <Check /> : <Copy />}
      {full ? (copied ? 'Copiado' : label) : null}
    </Button>
  );
}
