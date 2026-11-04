import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ContractBlock } from '@effinance/shared';
import { cn } from '@/lib/utils';

// The contract on A4 pages (spec §13.9): the editor's preview (scaled to its column) and the print
// page of a client's contract. Pages are laid out at real size (96 dpi: 794 × 1123 px, 20 mm margins)
// and the blocks are packed by their measured height.

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
const MARGIN = 76; // 20 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * MARGIN;
const LOGO_HEIGHT = 64 + 24;

/** Typography of each block type (the PDF's: Effy's TIPOS_DE_BLOCO). */
export function blockClass(type: ContractBlock['type']): string {
  switch (type) {
    case 'title':
      return 'text-center text-[17px] font-bold uppercase tracking-wide';
    case 'subtitle':
      return 'text-center text-[14px] font-bold';
    case 'heading1':
      return 'mt-3 text-[13.5px] font-bold';
    case 'heading2':
      return 'mt-2 text-[13px] font-bold uppercase';
    case 'label':
      return 'mt-1 text-[12.5px] font-bold';
    case 'paragraph_center':
      return 'text-center text-[12.5px] leading-[1.55]';
    case 'spacer':
      return 'h-4';
    default:
      return 'text-justify text-[12.5px] leading-[1.55] hyphens-auto';
  }
}

export function ContractBlockView({ block }: { block: ContractBlock }) {
  if (block.type === 'spacer') return <div className={blockClass('spacer')} aria-hidden />;
  return <p className={cn('whitespace-pre-wrap break-words', blockClass(block.type))}>{block.text}</p>;
}

/** Packs blocks into pages by their heights (a block taller than a page gets one of its own). */
export function paginate(heights: readonly number[], pageHeight: number, firstPageOffset = 0): number[][] {
  const pages: number[][] = [[]];
  let used = firstPageOffset;
  heights.forEach((h, i) => {
    const page = pages[pages.length - 1]!;
    if (page.length && used + h > pageHeight) {
      pages.push([i]);
      used = h;
    } else {
      page.push(i);
      used += h;
    }
  });
  return pages;
}

function Watermark({ image, dimmed }: { image: string; dimmed?: boolean }) {
  return <img src={image} alt="" aria-hidden className={cn('pointer-events-none absolute inset-0 size-full object-contain select-none', dimmed && 'opacity-35')} draggable={false} />;
}

interface ContractPagesProps {
  blocks: readonly ContractBlock[];
  watermark?: string | null;
  logo?: string | null;
  className?: string;
  /** Accessible name of the preview. */
  label?: string;
}

/** A4 pages scaled to the width of their container (screen only). */
export function ContractPages({ blocks, watermark, logo, className, label = 'Pré-visualização do contrato' }: ContractPagesProps) {
  const frame = useRef<HTMLDivElement>(null);
  const measurer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [pages, setPages] = useState<number[][]>([blocks.map((_, i) => i)]);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / PAGE_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = measurer.current;
    if (!el) return;
    const heights = [...el.children].map((child) => {
      const style = getComputedStyle(child);
      return (child as HTMLElement).offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom) + 6;
    });
    setPages(paginate(heights, CONTENT_HEIGHT, logo ? LOGO_HEIGHT : 0));
  }, [blocks, logo]);

  const pageStyle: CSSProperties = { width: PAGE_WIDTH, height: PAGE_HEIGHT, padding: MARGIN, transform: `scale(${scale})`, transformOrigin: 'top left' };

  return (
    <div ref={frame} className={cn('flex flex-col gap-4', className)} role="region" aria-label={label}>
      {/* Off-screen copy at real width, to measure each block. */}
      <div ref={measurer} aria-hidden className="pointer-events-none invisible fixed top-0 -left-[9999px] flex flex-col gap-1.5" style={{ width: CONTENT_WIDTH }}>
        {blocks.map((b, i) => (
          <ContractBlockView key={i} block={b} />
        ))}
      </div>
      {pages.map((indexes, p) => (
        <div key={p} className="relative" style={{ height: PAGE_HEIGHT * scale, width: PAGE_WIDTH * scale }}>
          <div className="absolute top-0 left-0 overflow-hidden bg-surface text-fg shadow-xs ring-1 ring-border" style={pageStyle}>
            {watermark ? <Watermark image={watermark} /> : null}
            <div className="relative flex flex-col gap-1.5">
              {p === 0 && logo ? <img src={logo} alt="" className="mb-6 h-16 max-w-[200px] object-contain object-left" /> : null}
              {indexes.map((i) => (
                <ContractBlockView key={i} block={blocks[i]!} />
              ))}
            </div>
            <span className="absolute right-[76px] bottom-8 text-[10px] text-muted">
              {p + 1}/{pages.length}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The same contract in the print flow: the browser paginates (`@page A4, 20 mm`), the watermark is a
 * fixed image (repeated on every printed page) and the logo opens the first page.
 */
export function ContractPrintFlow({ blocks, watermark, logo }: Omit<ContractPagesProps, 'className' | 'label'>) {
  return (
    <div className="hidden text-black print:block">
      <style>{'@page { size: A4 portrait; margin: 20mm; }'}</style>
      {watermark ? (
        <img src={watermark} alt="" aria-hidden className="pointer-events-none fixed inset-0 z-0 m-auto h-full w-full object-contain [print-color-adjust:exact]" />
      ) : null}
      {logo ? <img src={logo} alt="" className="relative z-10 mb-6 h-16 max-w-[200px] object-contain object-left [print-color-adjust:exact]" /> : null}
      <div className="relative z-10 flex flex-col gap-1.5">
        {blocks.map((b, i) => (
          <ContractBlockView key={i} block={b} />
        ))}
      </div>
    </div>
  );
}
