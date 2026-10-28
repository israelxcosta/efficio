import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkspaceKind } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { clampSize, hiddenCount, isVisible } from './layout';
import { useDashboardLayout } from './layout-store';
import { WIDGET_GROUPS, WIDGET_SPECS } from './specs';
import type { WidgetSize } from './types';

const sizeKey = (s: WidgetSize) => `${s.c}x${s.r}`;
const sizeLabel = (s: WidgetSize) => `${s.c} × ${s.r}`;

/** "Personalizar dashboard": turn cards on/off (a new card takes the first free space), sizes and reset. */
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
        description="Escolha os cards e o tamanho de cada um. No painel, arraste um card para qualquer lugar e use o canto dele para redimensionar."
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              <RotateCcw /> Restaurar layout padrão
            </Button>
            <Button
              variant="outline"
              disabled={hiddenCount(layout, WIDGET_SPECS, kind) === 0}
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
          {WIDGET_GROUPS.map((group) => {
            const specs = WIDGET_SPECS.filter((s) => s.group === group.id);
            if (specs.length === 0) return null;
            return (
              <section key={group.id} className="flex flex-col gap-2">
                <SectionLabel>{group.title}</SectionLabel>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {specs.map((spec) => {
                    const visible = isVisible(layout, spec, kind);
                    const size = clampSize(layout.sizes[spec.id] ?? spec.defaultSize, spec);
                    const preset = spec.presets.find((p) => sizeKey(p) === sizeKey(size));
                    return (
                      <li key={spec.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <Switch checked={visible} onCheckedChange={(v) => api.setVisible(spec.id, v)} aria-label={`Exibir ${spec.title}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-fg">{spec.title}</p>
                          <p className="text-caption text-muted">{spec.description}</p>
                        </div>
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
        description="Posições, tamanhos, cards ocultos e as opções de cada card voltam ao padrão."
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
