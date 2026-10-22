import { useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkspaceKind } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { clampSize, isVisible, mergeOrder } from './layout';
import { useDashboardLayout } from './layout-store';
import { SECTIONS, WIDGET_SPECS } from './specs';
import type { WidgetSize, WidgetSpec } from './types';

const sizeKey = (s: WidgetSize) => `${s.c}x${s.r}`;
const sizeLabel = (s: WidgetSize) => `${s.c} × ${s.r}`;

/** "Personalizar dashboard": show/hide cards, sizes, order, collapsed sections and reset. */
export function CustomizeSheet({ open, onOpenChange, kind }: { open: boolean; onOpenChange: (open: boolean) => void; kind: WorkspaceKind | undefined }) {
  const api = useDashboardLayout();
  const { layout } = api;
  const [confirmReset, setConfirmReset] = useState(false);
  const hidden = WIDGET_SPECS.filter((s) => !isVisible(layout, s, kind));

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="Personalizar dashboard"
        description="Escolha os cards, o tamanho e a ordem de cada seção. Também dá para arrastar os cards e o canto deles direto no dashboard."
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              <RotateCcw /> Restaurar layout padrão
            </Button>
            <Button
              variant="outline"
              disabled={hidden.length === 0}
              onClick={() => {
                api.showAll();
                toast.success('Todos os cards foram reexibidos.');
              }}
            >
              Reexibir todos os cards
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => {
            const specs = WIDGET_SPECS.filter((s) => s.section === section.id);
            if (specs.length === 0) return null;
            const order = mergeOrder(layout.order[section.id], WIDGET_SPECS.filter((s) => s.section === section.id).map((s) => s.id));
            const ordered = order.map((id) => specs.find((s) => s.id === id)).filter((s): s is WidgetSpec => Boolean(s));
            const visibleIds = ordered.filter((s) => isVisible(layout, s, kind)).map((s) => s.id);
            return (
              <section key={section.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <SectionLabel>{section.title}</SectionLabel>
                  <button type="button" onClick={() => api.toggleSection(section.id)} className="text-caption font-medium text-brand-text hover:underline">
                    {layout.collapsed.includes(section.id) ? 'Expandir seção' : 'Recolher seção'}
                  </button>
                </div>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {ordered.map((spec) => {
                    const visible = isVisible(layout, spec, kind);
                    const size = clampSize(layout.sizes[spec.id] ?? spec.defaultSize, spec);
                    const preset = spec.presets.find((p) => sizeKey(p) === sizeKey(size));
                    const position = visibleIds.indexOf(spec.id);
                    return (
                      <li key={spec.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <Switch checked={visible} onCheckedChange={(v) => api.setVisible(spec.id, v)} aria-label={`Exibir ${spec.title}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-fg">{spec.title}</p>
                          <p className="text-caption text-muted">{spec.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Select
                            size_="sm"
                            aria-label={`Tamanho de ${spec.title}`}
                            wrapperClassName="w-[132px]"
                            value={preset ? sizeKey(preset) : 'custom'}
                            disabled={!visible}
                            onChange={(e) => {
                              const chosen = spec.presets.find((p) => sizeKey(p) === e.target.value);
                              if (chosen) api.setSize(spec.id, chosen);
                            }}
                          >
                            {preset ? null : <option value="custom">{`${sizeLabel(size)} (personalizado)`}</option>}
                            {spec.presets.map((p) => (
                              <option key={sizeKey(p)} value={sizeKey(p)}>
                                {sizeLabel(p)}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Mover ${spec.title} para cima`}
                            disabled={!visible || position <= 0}
                            onClick={() => api.moveBy(section.id, spec.id, -1, visibleIds)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Mover ${spec.title} para baixo`}
                            disabled={!visible || position < 0 || position >= visibleIds.length - 1}
                            onClick={() => api.moveBy(section.id, spec.id, 1, visibleIds)}
                          >
                            <ArrowDown />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section className="flex flex-col gap-2">
            <div>
              <SectionLabel>Cards ocultos no Dashboard</SectionLabel>
              <p className="mt-0.5 text-caption text-muted">Cards que você ocultou pelo botão de olho ficam listados aqui para reexibir.</p>
            </div>
            {hidden.length === 0 ? (
              <p className="text-caption text-muted">
                Nenhum card oculto no momento. Passe o mouse sobre um card no Dashboard e clique no ícone de olho para ocultá-lo.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {hidden.map((spec) => (
                  <li key={spec.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{spec.title}</span>
                    <Button variant="outline" size="sm" onClick={() => api.setVisible(spec.id, true)}>
                      Reexibir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restaurar layout padrão?"
        description="Tamanhos, ordem, cards ocultos, seções recolhidas e as opções de cada card voltam ao padrão."
        confirmLabel="Restaurar"
        tone="primary"
        onConfirm={() => {
          api.reset();
          setConfirmReset(false);
          toast.success('Layout padrão restaurado.');
        }}
      />
    </>
  );
}
