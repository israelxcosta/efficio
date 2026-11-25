// "Personalizar" mode of a free board (Painel financeiro, Minha área): the state, the header buttons
// (Personalizar → Cards · Organizar · Concluir) and Escape to leave. The board itself is `FreeBoard`.

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpToLine, Check, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkspaceKind } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { canArrange, columnsForWidth, hiddenCount, resolveBoard } from './layout';
import { useBoardLayout, type BoardConfig } from './layout-store';
import { CUSTOMIZE_BUTTON_ID } from './widget-grid';

export interface BoardEditing {
  editing: boolean;
  customizing: boolean;
  setCustomizing: (open: boolean) => void;
  /** Enters the mode (optionally with the list of cards open). */
  start: (openCards?: boolean) => void;
  stop: () => void;
  /** Hidden cards (badge on the buttons). */
  hidden: number;
  /** The board shown at this width has empty spaces "Organizar" can close. */
  hasGaps: boolean;
  arrange: () => void;
  /** Screen-reader line about the mode (render it in an `aria-live` region). */
  message: string;
}

/** State of the mode for `board`, whose width (the page's content box) picks the columns. */
export function useBoardEditing(board: BoardConfig, kind: WorkspaceKind | undefined, width: number): BoardEditing {
  const api = useBoardLayout(board);
  const [customizing, setCustomizing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const cols = columnsForWidth(width);
  const hidden = hiddenCount(api.layout, board.specs, kind);
  const hasGaps = useMemo(() => width > 0 && canArrange(resolveBoard(api.layout, board.specs, kind, cols), cols), [api.layout, board.specs, kind, cols, width]);

  const start = (openCards = false) => {
    setEditing(true);
    if (openCards) setCustomizing(true);
    setMessage('Modo de personalização. Use a alça de cada card para mover.');
  };
  const stop = () => {
    setEditing(false);
    setCustomizing(false);
    setMessage('');
    // "Concluir" goes away: the focus goes back to "Personalizar" (same id).
    requestAnimationFrame(() => document.getElementById(CUSTOMIZE_BUTTON_ID)?.focus());
  };
  const arrange = () => {
    const before = api.layout;
    api.arrange(cols);
    // The button goes away with the gaps: keep the focus in the header.
    requestAnimationFrame(() => document.getElementById(CUSTOMIZE_BUTTON_ID)?.focus());
    toast('Cards organizados.', { action: { label: 'Desfazer', onClick: () => api.restore(before) } });
  };

  // Escape leaves the mode, unless it closed a sheet/menu or cancelled a drag (those prevent it).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || customizing) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      setEditing(false);
      setMessage('');
      requestAnimationFrame(() => document.getElementById(CUSTOMIZE_BUTTON_ID)?.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, customizing]);

  return { editing, customizing, setCustomizing, start, stop, hidden, hasGaps, arrange, message };
}

export function HiddenBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="tabular rounded-full bg-bg-subtle px-1.5 text-mini font-semibold text-muted">{count === 1 ? '1 oculto' : `${count} ocultos`}</span>;
}

/** Header buttons: "Personalizar" outside the mode; "Cards", "Organizar" (with gaps) and "Concluir" in it. */
export function BoardEditControls({ editing: e }: { editing: BoardEditing }) {
  if (!e.editing) {
    return (
      <Button id={CUSTOMIZE_BUTTON_ID} variant="outline" size="sm" onClick={() => e.start()}>
        <SlidersHorizontal /> Personalizar
        <HiddenBadge count={e.hidden} />
      </Button>
    );
  }
  return (
    <>
      <Button id={CUSTOMIZE_BUTTON_ID} variant="outline" size="sm" onClick={() => e.setCustomizing(true)}>
        <LayoutGrid /> Cards
        <HiddenBadge count={e.hidden} />
      </Button>
      {e.hasGaps ? (
        <Tooltip content="Sobe os cards para fechar os espaços vazios do painel">
          <Button variant="outline" size="sm" onClick={e.arrange}>
            <ArrowUpToLine /> Organizar
          </Button>
        </Tooltip>
      ) : null}
      <Button variant="primary" size="sm" onClick={e.stop}>
        <Check /> Concluir
      </Button>
    </>
  );
}
