import { useEffect } from 'react';

/** Prints in the light theme (dark backgrounds waste ink and some browsers drop them anyway). */
export function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement;
    let saved: string | undefined;
    const before = () => {
      saved = root.dataset.theme;
      root.dataset.theme = 'light';
    };
    const after = () => {
      if (saved) root.dataset.theme = saved;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}
