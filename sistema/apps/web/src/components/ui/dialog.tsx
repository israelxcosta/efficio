import type { ReactNode } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, title, description, children, footer, className }: ModalProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-fade-in dark:bg-black/55" />
        {/*
          The dialog never scrolls as a whole: the header and the footer stay put and only the body
          scrolls, inside the rounded frame (overflow-hidden keeps the scrollbar off the corners).
        */}
        <RDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg outline-none data-[state=open]:animate-dialog-in',
            className,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
            <div>
              <RDialog.Title className="text-lg font-semibold tracking-tight">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">Diálogo</RDialog.Description>
              )}
            </div>
            <RDialog.Close
              className="-mt-1 -mr-2 flex size-8 items-center justify-center rounded-md text-muted hover:bg-bg-subtle hover:text-fg"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </RDialog.Close>
          </div>
          {children ? (
            <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pt-5', footer ? 'pb-1' : 'pb-6')}>{children}</div>
          ) : (
            <div className={footer ? undefined : 'pb-6'} />
          )}
          {footer ? <div className="flex shrink-0 justify-end gap-2 px-6 pt-5 pb-6">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  tone = 'danger',
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
