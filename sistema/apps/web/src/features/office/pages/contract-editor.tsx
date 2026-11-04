import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ChevronLeft, Ellipsis, FileText, ListPlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CONTRACT_BLOCK_TYPES,
  CONTRACT_BLOCK_TYPE_LABELS,
  CONTRACT_FACTORY_BLOCKS,
  CONTRACT_FACTORY_WATERMARK,
  MAX_CONTRACT_BLOCKS,
  MAX_CONTRACT_TOTAL_CHARS,
  MAX_OFFICE_IMAGE_BYTES,
  blocksFromPlainText,
  contractCharCount,
  fillContractBlocks,
  missingFactoryPlaceholders,
  unknownPlaceholders,
  type ContractBlockType,
  type ContractTemplateInput,
  type ContractTemplateResponse,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/input';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SearchSelect } from '@/components/ui/search-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { OFFICE_ONLY_REASON, RestrictedAccess } from '@/components/layout/finance-gate';
import { usePermissions } from '@/features/auth/permissions';
import { ApiRequestError } from '@/lib/api';
import { checkImageFile, pickImage, readAsDataUrl } from '@/lib/image';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useContractTemplate, useOffice, useResetContractTemplate, useSaveContractTemplate } from '../api';
import { ContractPages } from '../components/contract-preview';
import {
  blockCharWarning,
  blockKey,
  fromDraft,
  importBlocks,
  insertAtCursor,
  moveBlock,
  placeholderOptions,
  sameBlocks,
  sampleValues,
  templateDescription,
  toDraft,
  type DraftBlock,
} from '../contract-editor-logic';

/** `/configuracoes/contrato` (spec §13.9): only with `office`; never opens over a failed read. */
export default function ContractEditorPage() {
  const { can } = usePermissions();
  if (!can('office')) return <RestrictedAccess message={OFFICE_ONLY_REASON} />;
  return <ContractEditor />;
}

interface WatermarkDraft {
  /** The image shown; `custom` says whether it is the office's own. */
  image: string;
  custom: boolean;
  enabled: boolean;
}

function ContractEditor() {
  const template = useContractTemplate(true);
  const office = useOffice(true);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Modelo de contrato · Efficio';
    return () => {
      document.title = previous;
    };
  }, []);

  if (template.isError) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <PageHeader title="Modelo de contrato" />
        <ErrorState
          error={new Error('Não foi possível carregar o modelo gravado. Tente de novo; o editor só abre com o modelo carregado.')}
          onRetry={() => template.refetch()}
        />
      </div>
    );
  }
  if (!template.data) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <BackLink />
        <Skeleton className="h-8 w-64" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  return <EditorBody template={template.data} sample={sampleValues(office.data)} />;
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
      <Link to="/configuracoes?aba=escritorio">
        <ChevronLeft /> Escritório
      </Link>
    </Button>
  );
}

function initialWatermark(t: ContractTemplateResponse): WatermarkDraft {
  return { image: t.watermarkImage, custom: t.watermark.source === 'custom', enabled: t.watermark.enabled };
}

function EditorBody({ template, sample }: { template: ContractTemplateResponse; sample: Record<string, string> }) {
  const [params, setParams] = useSearchParams();
  const save = useSaveContractTemplate();
  const reset = useResetContractTemplate();
  const { subscriptionActive } = usePermissions();
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => toDraft(template.blocks));
  const [watermark, setWatermark] = useState<WatermarkDraft>(() => initialWatermark(template));
  const [view, setView] = useState<'edit' | 'preview'>(params.get('visao') === 'previa' ? 'preview' : 'edit');
  const [importing, setImporting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [blockErrors, setBlockErrors] = useState<Record<number, string>>({});
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const focused = useRef<{ key: string; start: number; end: number } | null>(null);

  // A fresh answer after saving or restoring is the new baseline.
  useEffect(() => {
    setBlocks(toDraft(template.blocks));
    setWatermark(initialWatermark(template));
    setBlockErrors({});
  }, [template]);

  const saved = useMemo(() => fromDraft(blocks), [blocks]);
  const blocksChanged = !sameBlocks(saved, template.blocks);
  const base = initialWatermark(template);
  const watermarkChanged = watermark.image !== base.image || watermark.custom !== base.custom;
  const enabledChanged = watermark.enabled !== base.enabled;
  const dirty = blocksChanged || watermarkChanged || enabledChanged;

  // Leaving with changes asks first (in-app navigation and closing the tab).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // The preview follows the typing 300 ms later.
  const [previewBlocks, setPreviewBlocks] = useState(saved);
  useEffect(() => {
    const t = setTimeout(() => setPreviewBlocks(saved), 300);
    return () => clearTimeout(t);
  }, [saved]);
  const filled = useMemo(() => fillContractBlocks(previewBlocks, sample, { withDiscount: true }), [previewBlocks, sample]);

  const unknown = useMemo(() => unknownPlaceholders(saved), [saved]);
  const missingFactory = useMemo(() => missingFactoryPlaceholders(saved, CONTRACT_FACTORY_BLOCKS), [saved]);
  const total = contractCharCount(saved);

  function patch(key: string, change: Partial<DraftBlock>) {
    setBlocks((list) => list.map((b) => (b.key === key ? { ...b, ...change } : b)));
  }
  function move(index: number, delta: -1 | 1) {
    setBlocks((list) => moveBlock(list, index, delta));
  }
  function insertBelow(index: number) {
    if (blocks.length >= MAX_CONTRACT_BLOCKS) return toast.error(`O contrato pode ter no máximo ${MAX_CONTRACT_BLOCKS} blocos.`);
    const block: DraftBlock = { key: blockKey(), type: 'paragraph', text: '' };
    setBlocks((list) => [...list.slice(0, index + 1), block, ...list.slice(index + 1)]);
    requestAnimationFrame(() => document.getElementById(`block-text-${block.key}`)?.focus());
  }

  function insertField(placeholder: string) {
    const target = focused.current && blocks.find((b) => b.key === focused.current!.key && b.type !== 'spacer');
    if (!target || !focused.current) {
      toast.info('Clique primeiro no bloco onde o campo deve entrar.');
      return;
    }
    const { text, caret } = insertAtCursor(target.text ?? '', focused.current.start, focused.current.end, placeholder);
    patch(target.key, { text });
    focused.current = { key: target.key, start: caret, end: caret };
    requestAnimationFrame(() => {
      const el = document.getElementById(`block-text-${target.key}`) as HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  async function submit() {
    const input: ContractTemplateInput = {};
    if (blocksChanged) input.blocks = saved;
    if (watermarkChanged) input.watermark = watermark.custom ? watermark.image : null;
    if (enabledChanged || !Object.keys(input).length) input.watermarkEnabled = watermark.enabled;
    if (total > MAX_CONTRACT_TOTAL_CHARS) return toast.error(`O contrato passa de ${MAX_CONTRACT_TOTAL_CHARS.toLocaleString('pt-BR')} caracteres.`);
    try {
      await save.mutateAsync(input);
      toast.success('Modelo de contrato salvo.');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const errs: Record<number, string> = {};
        for (const [path, message] of Object.entries(error.fieldErrors())) {
          const m = /^blocks\.(\d+)/.exec(path);
          if (m) errs[Number(m[1])] = message;
        }
        if (Object.keys(errs).length) {
          setBlockErrors(errs);
          const first = blocks[Math.min(...Object.keys(errs).map(Number))];
          if (first) document.getElementById(`block-text-${first.key}`)?.focus();
          return;
        }
      }
      toastError(error);
    }
  }

  async function changeWatermark() {
    const file = await pickImage();
    if (!file) return;
    const check = checkImageFile(file, MAX_OFFICE_IMAGE_BYTES, 'A imagem passa de 500 KB.');
    if (!check.ok) return setWatermarkError(check.error);
    setWatermarkError(null);
    setWatermark((w) => ({ ...w, custom: true, enabled: true }));
    const image = await readAsDataUrl(file);
    setWatermark((w) => ({ ...w, image, custom: true }));
  }

  const onBlockKey = (index: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const key = blocks[index]!.key;
    move(index, e.key === 'ArrowUp' ? -1 : 1);
    requestAnimationFrame(() => document.getElementById(`block-text-${key}`)?.focus());
  };

  const editor = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchSelect
          value=""
          onChange={insertField}
          options={placeholderOptions()}
          searchPlaceholder="Buscar campo…"
          trigger={
            <Button variant="outline" size="sm">
              <ListPlus /> Inserir campo
            </Button>
          }
          aria-label="Inserir campo"
        />
        <p className="text-caption text-muted">Os campos entre colchetes são trocados pelos dados de cada cliente ao gerar o contrato.</p>
      </div>

      {unknown.length ? (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-body-sm" role="status">
          <p className="font-semibold text-danger">
            {unknown.length === 1 ? '1 campo que o sistema não reconhece' : `${unknown.length} campos que o sistema não reconhece`}
          </p>
          <p className="mt-1 font-mono text-xs break-words text-fg">{unknown.join(' · ')}</p>
          <p className="mt-1 text-muted">Saem do jeito que estão escritos. Confira a grafia ou troque por um campo da lista.</p>
        </div>
      ) : null}
      {missingFactory.length ? (
        <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-body-sm" role="status">
          <p className="font-semibold text-warning">
            {missingFactory.length === 1 ? '1 campo do modelo de fábrica não aparece mais' : `${missingFactory.length} campos do modelo de fábrica não aparecem mais`}
          </p>
          <p className="mt-1 font-mono text-xs break-words text-fg">{missingFactory.join(' · ')}</p>
          <p className="mt-1 text-muted">Sem eles, o contrato sai sem esses dados. Pode ser intencional.</p>
        </div>
      ) : null}

      <Card className="divide-y divide-border">
        {blocks.length === 0 ? <p className="p-4 text-body-sm text-muted">O modelo está vazio. Adicione um bloco ou importe o texto do contrato.</p> : null}
        {blocks.map((b, i) => (
          <BlockRow
            key={b.key}
            block={b}
            index={i}
            count={blocks.length}
            error={blockErrors[i]}
            onType={(type) => patch(b.key, { type, text: type === 'spacer' ? undefined : (b.text ?? '') })}
            onText={(text) => patch(b.key, { text })}
            onMove={(delta) => move(i, delta)}
            onInsertBelow={() => insertBelow(i)}
            onRemove={() => setBlocks((list) => list.filter((x) => x.key !== b.key))}
            onCursor={(start, end) => (focused.current = { key: b.key, start, end })}
            onKeyDown={onBlockKey(i)}
          />
        ))}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => insertBelow(blocks.length - 1)} disabled={blocks.length >= MAX_CONTRACT_BLOCKS}>
          <Plus /> Adicionar bloco no fim
        </Button>
        <span className="text-caption text-muted">
          {blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos'} · {total.toLocaleString('pt-BR')} de {MAX_CONTRACT_TOTAL_CHARS.toLocaleString('pt-BR')} caracteres
        </span>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative h-[136px] w-24 shrink-0 overflow-hidden rounded-sm bg-surface shadow-xs ring-1 ring-border">
            <img src={watermark.image} alt="Marca d'água" className={cn('size-full object-contain', !watermark.enabled && 'opacity-35')} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label className="flex items-center justify-between gap-3 text-sm font-medium text-fg" htmlFor="watermark-enabled">
              Usar marca d'água
              <Switch id="watermark-enabled" checked={watermark.enabled} onCheckedChange={(v) => setWatermark((w) => ({ ...w, enabled: v }))} />
            </label>
            <p className="text-caption text-muted">Aparece atrás do texto em todas as páginas. PNG, JPG ou WebP até 500 KB.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void changeWatermark()}>
                Trocar imagem
              </Button>
              {watermark.custom ? (
                <Button variant="ghost" size="sm" onClick={() => setWatermark((w) => ({ ...w, image: CONTRACT_FACTORY_WATERMARK, custom: false }))}>
                  Voltar à de fábrica
                </Button>
              ) : null}
            </div>
            {watermarkError ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {watermarkError}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );

  const preview = (
    <ContractPages blocks={filled} watermark={watermark.enabled ? watermark.image : null} label="Pré-visualização com um cliente de exemplo" />
  );

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <PageHeader
        title="Modelo de contrato"
        description={templateDescription(template)}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações do modelo">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<FileText />} onSelect={() => setImporting(true)}>
                  Importar texto…
                </DropdownMenuItem>
                <DropdownMenuItem icon={<RotateCcw />} disabled={!subscriptionActive} onSelect={() => setConfirmReset(true)}>
                  Voltar ao modelo de fábrica…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="xl:hidden" onClick={() => setView(view === 'preview' ? 'edit' : 'preview')}>
              {view === 'preview' ? 'Editar' : 'Pré-visualizar'}
            </Button>
            <Button onClick={() => void submit()} loading={save.isPending} disabled={!dirty || !subscriptionActive}>
              Salvar modelo
            </Button>
          </>
        }
      />

      <div className="xl:hidden">
        <SegmentedControl
          ariaLabel="Modo"
          value={view}
          onChange={(v) => {
            setView(v);
            setParams((p) => {
              const next = new URLSearchParams(p);
              if (v === 'preview') next.set('visao', 'previa');
              else next.delete('visao');
              return next;
            }, { replace: true });
          }}
          options={[
            { value: 'edit' as const, label: 'Editar' },
            { value: 'preview' as const, label: 'Pré-visualizar' },
          ]}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className={cn(view === 'preview' && 'max-xl:hidden')}>{editor}</div>
        <div className={cn('min-w-0', view === 'edit' && 'max-xl:hidden')}>
          <div className="xl:sticky xl:top-6">
            <p className="mb-3 text-caption text-muted">Pré-visualização com um cliente de exemplo (com desconto de pontualidade).</p>
            {preview}
          </div>
        </div>
      </div>

      <ImportTextDialog
        open={importing}
        onOpenChange={setImporting}
        onImport={(text, mode) => {
          const imported = blocksFromPlainText(text);
          setBlocks((list) => importBlocks(list, imported, mode).slice(0, MAX_CONTRACT_BLOCKS));
          setImporting(false);
          toast.success(`Texto importado: ${imported.length} ${imported.length === 1 ? 'bloco' : 'blocos'}. Revise e salve.`);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Voltar ao modelo de fábrica?"
        description="O texto editado e a marca d'água trocada são descartados agora. Contratos já gerados não mudam."
        confirmLabel="Voltar ao modelo de fábrica"
        loading={reset.isPending}
        onConfirm={async () => {
          try {
            await reset.mutateAsync();
            setConfirmReset(false);
            toast.success('Modelo de fábrica restaurado.');
          } catch (error) {
            toastError(error);
          }
        }}
      />
      <Modal
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Sair sem salvar?"
        description="As mudanças no modelo de contrato serão perdidas."
        footer={
          <>
            <Button variant="ghost" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
              Continuar editando
            </Button>
            <Button variant="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
              Sair sem salvar
            </Button>
          </>
        }
      />
    </div>
  );
}

function BlockRow({
  block: b,
  index,
  count,
  error,
  onType,
  onText,
  onMove,
  onInsertBelow,
  onRemove,
  onCursor,
  onKeyDown,
}: {
  block: DraftBlock;
  index: number;
  count: number;
  error?: string;
  onType: (t: ContractBlockType) => void;
  onText: (text: string) => void;
  onMove: (delta: -1 | 1) => void;
  onInsertBelow: () => void;
  onRemove: () => void;
  onCursor: (start: number, end: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const warning = blockCharWarning(b.text?.length ?? 0);
  // Grows with the text up to 12 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight + 2, line * 12 + 20)}px`;
  }, [b.text]);
  const remember = () => area.current && onCursor(area.current.selectionStart, area.current.selectionEnd);

  return (
    <div className="flex flex-col gap-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular w-6 text-mini text-subtle">{index + 1}</span>
        <div className="min-w-0 flex-1 sm:max-w-56 max-sm:basis-[calc(100%-2rem)]">
          <Select size_="sm" value={b.type} aria-label={`Tipo do bloco ${index + 1}`} onChange={(e) => onType(e.target.value as ContractBlockType)}>
            {CONTRACT_BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_BLOCK_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        {b.rule === 'discount' ? <Badge tone="neutral">Só com desconto</Badge> : null}
        <span className="ml-auto flex items-center gap-0.5 max-sm:ml-6">
          <Button variant="ghost" size="icon-sm" aria-label={`Subir o bloco ${index + 1}`} title="Subir" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Descer o bloco ${index + 1}`} title="Descer" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Inserir bloco abaixo do ${index + 1}`} title="Inserir bloco abaixo" onClick={onInsertBelow}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Remover o bloco ${index + 1}`} title="Remover" onClick={() => setConfirming(true)}>
            <Trash2 />
          </Button>
        </span>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-body-sm" role="alert">
          <span className="text-fg">Remover este bloco? Nada é gravado até salvar.</span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="danger" onClick={onRemove}>
              Remover
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </span>
        </div>
      ) : null}
      {b.type === 'spacer' ? (
        <p className="text-caption text-subtle">Espaço entre blocos.</p>
      ) : (
        <Textarea
          ref={area}
          id={`block-text-${b.key}`}
          aria-label={`Texto do bloco ${index + 1}`}
          aria-invalid={error ? true : undefined}
          className={cn('min-h-0 resize-none text-body-sm leading-relaxed', b.type.startsWith('heading') || b.type === 'title' || b.type === 'label' ? 'font-semibold' : '')}
          rows={1}
          value={b.text ?? ''}
          onChange={(e) => {
            onText(e.target.value);
            onCursor(e.target.selectionStart, e.target.selectionEnd);
          }}
          onFocus={remember}
          onSelect={remember}
          onKeyUp={remember}
          onKeyDown={onKeyDown}
        />
      )}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : warning ? (
        <p className="text-caption text-warning">{warning}</p>
      ) : null}
    </div>
  );
}

function ImportTextDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (o: boolean) => void; onImport: (text: string, mode: 'replace' | 'append') => void }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  useEffect(() => {
    if (open) {
      setText('');
      setMode('replace');
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Importar texto"
      description="Cole o contrato. Cada parágrafo vira um bloco. Linhas em maiúsculas viram títulos de cláusula."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!text.trim()} onClick={() => onImport(text, mode)}>
            Importar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto do contrato" placeholder="CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS…" />
        <fieldset className="flex flex-wrap gap-4 text-body-sm">
          <legend className="sr-only">Como importar</legend>
          {(
            [
              ['replace', 'Substituir o modelo'],
              ['append', 'Adicionar no fim'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="import-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-[var(--app-primary)]" />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
}
