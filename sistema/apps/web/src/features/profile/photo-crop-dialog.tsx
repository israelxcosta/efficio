import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { clampCrop, cropRect, renderCrop, type CropState } from '@/lib/image';

const AREA = 256;

/** The image placed in a square of `box` px for the crop (same math as the canvas). */
function imageStyle(image: HTMLImageElement | null, crop: CropState, box: number): React.CSSProperties {
  if (!image) return { display: 'none' };
  const { sx, sy, size } = cropRect(image.naturalWidth, image.naturalHeight, crop);
  const scale = box / size;
  return {
    position: 'absolute',
    width: image.naturalWidth * scale,
    height: image.naturalHeight * scale,
    left: -sx * scale,
    top: -sy * scale,
    maxWidth: 'none',
  };
}

/**
 * "Ajustar foto" (spec §15.3): a square area with the image draggable, the zoom and the round 96px
 * preview; the browser draws 256×256 WebP before sending.
 */
export function PhotoCropDialog({ source, onCancel, onSave, saving }: { source: string | null; onCancel: () => void; onSave: (dataUrl: string) => void; saving: boolean }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; crop: CropState } | null>(null);

  useEffect(() => {
    setImage(null);
    setCrop({ zoom: 1, x: 0, y: 0 });
    if (!source) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = source;
  }, [source]);

  const update = (next: CropState) => image && setCrop(clampCrop(image.naturalWidth, image.naturalHeight, next));

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const box = e.currentTarget.clientWidth || AREA;
    update({ ...d.crop, x: d.crop.x + (e.clientX - d.x) / box, y: d.crop.y + (e.clientY - d.y) / box });
  }

  return (
    <Modal
      open={source !== null}
      onOpenChange={(o) => !o && onCancel()}
      title="Ajustar foto"
      description="Arraste a imagem e use o zoom para enquadrar."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={!image} onClick={async () => image && onSave(await renderCrop(image, crop))}>
            Salvar foto
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          className="relative aspect-square w-full max-w-64 cursor-grab touch-none overflow-hidden rounded-lg bg-bg-subtle select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          role="img"
          aria-label="Área de recorte"
        >
          {image ? <img src={image.src} alt="" draggable={false} style={imageStyle(image, crop, AREA)} className="pointer-events-none" /> : null}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-[999px] ring-black/30" />
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto">
          <span className="relative block size-24 overflow-hidden rounded-full bg-bg-subtle ring-1 ring-border" aria-label="Prévia da foto" role="img">
            {image ? <img src={image.src} alt="" draggable={false} style={imageStyle(image, crop, 96)} /> : null}
          </span>
          <label className="flex w-full flex-col gap-1 text-body-sm font-medium text-fg sm:w-40">
            Zoom
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => update({ ...crop, zoom: Number(e.target.value) })}
              className="accent-[var(--app-primary)]"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
