/**
 * Enter/exit motion for floating Radix content (docs/design-system.md → "Motion"): a short scale
 * from the trigger (Radix exposes the side it opened from as a transform-origin variable), 200ms in
 * and 150ms out with --ease-out. Under reduced motion the keyframes become a plain crossfade
 * (styles/index.css). Tooltips are excluded on purpose: they keep their delayed-open fade only.
 *
 * Full class strings (not built from parts) so Tailwind's scanner picks them up.
 */
export const popoverMotion =
  'origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';

export const menuMotion =
  'origin-(--radix-dropdown-menu-content-transform-origin) data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';

/** Select in `position="popper"` mode (the only one that exposes the origin variable). */
export const selectMotion =
  'origin-(--radix-select-content-transform-origin) data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';
