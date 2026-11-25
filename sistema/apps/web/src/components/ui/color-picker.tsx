import { Check } from 'lucide-react';
import { COLOR_SWATCHES } from '@effinance/shared';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const custom = !COLOR_SWATCHES.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
      {COLOR_SWATCHES.map((color) => {
        const active = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={color}
            onClick={() => onChange(color)}
            className={cn(
              // Hover shows a neutral ring (the swatch does not grow); the chosen one rings in its colour.
              'flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-[box-shadow] duration-(--dur-hover)',
              active ? 'ring-2' : 'hover:ring-2 hover:ring-border-strong',
            )}
            style={{ backgroundColor: color, ...(active ? { ['--tw-ring-color' as string]: color } : {}) }}
          >
            {active ? <Check className="size-4 text-white" strokeWidth={3} /> : null}
          </button>
        );
      })}
      <label
        className={cn(
          'relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border-strong text-mini text-muted',
          custom && 'ring-2 ring-offset-2 ring-offset-surface',
        )}
        style={custom ? { backgroundColor: value, ['--tw-ring-color' as string]: value } : undefined}
        title="Cor personalizada"
      >
        {custom ? <Check className="size-4 text-white" strokeWidth={3} /> : '+'}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Cor personalizada"
        />
      </label>
    </div>
  );
}
