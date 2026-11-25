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
import { FINANCE_BOARD, useBoardLayout, type BoardConfig } from './layout-store';
import { WIDGET_GROUPS } from './specs';
import type { WidgetGroupSpec, WidgetSize } from './types';

const sizeKey = (s: WidgetSize) => `${s.c}x${s.r}`;
const sizeLabel = (s: WidgetSize) => `${s.c} × ${s.r}`;

interface CustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: WorkspaceKind | undefined;
  /** The board being customized (default: the Painel financeiro) and its groups of cards. */
  board?: BoardConfig;
  groups?: readonly WidgetGroupSpec[];
  /** Name of the page in the texts ("Dashboard", "Minha área"). */
  place?: string;
}

/** "Personalizar": turn cards on/off (a new card takes the first free space), sizes and reset. */
export function CustomizeSheet({ open, onOpenChange, kind, board = FINANCE_BOARD, groups = WIDGET_GROUPS, place = 'Dashboard' }: CustomizeSheetProps) {
  const api = useBoardLayout(board);
  const { layout } = api;
  const specsAll = board.specs;
  const [confirmReset, setConfirmReset] = useState(false);
  const hidden = specsAll.filter((s) => !isVisible(layout, s, kind));

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Personalizar ${place === 'Dashboard' ? 'dashboard' : place}`}
        description="Escolha os cards e o tamanho de cada um. No painel, arraste um card para qualquer lugar e use o canto dele para redimensionar."
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              <RotateCcw /> Restaurar layout padrão
            </Button>
            <Button
              variant="outline"
              disabled={hiddenCount(layout, specsAll, kind) === 0}
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
          {groups.map((group) => {
            const specs = specsAll.filter((s) => s.group === group.id);
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
                          <p className="text-caption font-medium text-fg">{spec.title}</p>
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
            <SectionLabel>{place === 'Dashboard' ? 'Cards ocultos no Dashboard' : `Cards ocultos na ${place}`}</SectionLabel>
            {hidden.length === 0 ? (
              <p className="text-caption text-muted">
                Nenhum card oculto no momento. Em Personalizar, clique no ícone de olho de um card para ocultá-lo.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {hidden.map((spec) => (
                  <li key={spec.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-caption font-medium text-fg">{spec.title}</span>
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
