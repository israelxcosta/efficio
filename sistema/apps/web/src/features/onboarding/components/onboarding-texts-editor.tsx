import { useMemo, useState } from 'react';
import { EyeOff, RotateCcw } from 'lucide-react';
import { MAX_ONBOARDING_TEXT_CHARS, ONBOARDING_PLACEHOLDERS } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HelpTip } from '@/components/ui/help-tip';
import { Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { editorSections } from '../onboarding-logic';

/** The placeholders the texts may use, for a HelpTip. */
export function PlaceholdersHelp() {
  return (
    <HelpTip label="Marcadores disponíveis" side="bottom">
      <span className="block font-semibold">Marcadores</span>
      <span className="mt-1 block">
        Escreva entre chaves duplas; o documento troca pelo dado do cliente ou do escritório.
      </span>
      <span className="mt-2 grid max-h-72 gap-1 overflow-y-auto">
        {Object.entries(ONBOARDING_PLACEHOLDERS).map(([key, label]) => (
          <span key={key} className="block">
            <code className="rounded bg-bg-subtle px-1 text-[12px]">{`{{${key}}}`}</code> {label}
          </span>
        ))}
      </span>
    </HelpTip>
  );
}

interface OnboardingTextsEditorProps {
  /** What the text shows without this layer: the factory text (template) or the office's (client). */
  base: (key: string) => string;
  /** Factory text of a key (shown beside each block). */
  factory: (key: string) => string;
  texts: Record<string, string>;
  onTextsChange: (texts: Record<string, string>) => void;
  hidden: string[];
  onHiddenChange: (hidden: string[]) => void;
  /** Hidden by the layer below (the office's template, in a client's adjustment): shown as hidden, locked. */
  lockedHidden?: ReadonlySet<string>;
  readOnly?: boolean;
  /** "Restaurar padrão" (template) or "Usar o texto do modelo" (client). */
  restoreLabel?: string;
}

/** The template's texts by slide and block: edit, restore the default, hide items. */
export function OnboardingTextsEditor({
  base,
  factory,
  texts,
  onTextsChange,
  hidden,
  onHiddenChange,
  lockedHidden,
  readOnly,
  restoreLabel = 'Restaurar padrão',
}: OnboardingTextsEditorProps) {
  const sections = useMemo(() => editorSections(), []);
  const [current, setCurrent] = useState(sections[0]!.key);
  const section = sections.find((s) => s.key === current) ?? sections[0]!;
  const hiddenSet = new Set(hidden);
  const changedIn = (key: string) =>
    sections
      .find((s) => s.key === key)!
      .groups.some(
        (g) => g.blocks.some((b) => b.key in texts) || (g.hideKey && hiddenSet.has(g.hideKey)),
      );

  const setText = (key: string, value: string) => {
    const next = { ...texts };
    if (value === base(key)) delete next[key];
    else next[key] = value;
    onTextsChange(next);
  };
  const restore = (key: string) => {
    const next = { ...texts };
    delete next[key];
    onTextsChange(next);
  };
  const setHidden = (key: string, hide: boolean) =>
    onHiddenChange(hide ? [...hidden, key] : hidden.filter((h) => h !== key));

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Slides do modelo" className="max-lg:hidden">
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                aria-current={s.key === current ? 'true' : undefined}
                onClick={() => setCurrent(s.key)}
                className={cn(
                  'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm',
                  s.key === current
                    ? 'bg-primary-soft font-semibold text-primary-soft-fg'
                    : 'text-fg hover:bg-surface-muted',
                )}
              >
                <span className="truncate">{s.title}</span>
                {changedIn(s.key) ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-brand-500"
                    aria-label="alterado"
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="lg:hidden">
        <Select
          aria-label="Slide do modelo"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {section.groups.map((group) => {
          const locked = Boolean(group.hideKey && lockedHidden?.has(group.hideKey));
          const isHidden = locked || Boolean(group.hideKey && hiddenSet.has(group.hideKey));
          return (
            <fieldset
              key={group.id}
              className={cn('rounded-xl border border-border p-4', isHidden && 'bg-surface-muted')}
            >
              <legend className="sr-only">{group.title}</legend>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  <span className="truncate">{group.title}</span>
                  {group.when ? <Badge tone="neutral">{group.when}</Badge> : null}
                  {isHidden ? (
                    <Badge tone="warning">
                      <EyeOff className="mr-1 inline size-3" aria-hidden />
                      {locked ? 'Oculto no modelo' : 'Oculto'}
                    </Badge>
                  ) : null}
                </p>
                {group.hideKey ? (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Mostrar
                    <Switch
                      checked={!isHidden}
                      disabled={readOnly || locked}
                      onCheckedChange={(show) => setHidden(group.hideKey!, !show)}
                      aria-label={`Mostrar "${group.title}"`}
                    />
                  </label>
                ) : null}
              </div>
              {!isHidden ? (
                <div className="mt-3 flex flex-col gap-3">
                  {group.blocks.map((block) => {
                    const changed = block.key in texts;
                    const value = texts[block.key] ?? base(block.key);
                    return (
                      <div key={block.key} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor={`ob-${block.key}`}
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-fg"
                          >
                            {block.label}
                            <HelpTip label={`Texto de fábrica: ${block.label}`}>
                              <span className="block font-semibold">Texto de fábrica</span>
                              <span className="mt-1 block">{factory(block.key) || '(vazio)'}</span>
                            </HelpTip>
                          </label>
                          {changed && !readOnly ? (
                            <Button variant="ghost" size="sm" onClick={() => restore(block.key)}>
                              <RotateCcw /> {restoreLabel}
                            </Button>
                          ) : null}
                        </div>
                        <Textarea
                          id={`ob-${block.key}`}
                          rows={value.length > 90 ? 3 : 2}
                          value={value}
                          readOnly={readOnly}
                          maxLength={MAX_ONBOARDING_TEXT_CHARS}
                          className={cn(changed && 'border-brand-500/60')}
                          onChange={(e) => setText(block.key, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
