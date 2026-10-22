import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#090c11' : '#f6f6f4');
    try {
      localStorage.setItem('imagzal-theme', theme);
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as ViewTransitionDocument;
    const button = document.querySelector<HTMLElement>('.theme-toggle');

    if (button) {
      const rect = button.getBoundingClientRect();
      root.style.setProperty('--theme-x', `${rect.left + rect.width / 2}px`);
      root.style.setProperty('--theme-y', `${rect.top + rect.height / 2}px`);
    }

    const apply = () => {
      root.dataset.theme = next;
      root.style.colorScheme = next;
      setTheme(next);
    };

    if (!reduceMotion && typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => {
        flushSync(apply);
      });
    } else {
      apply();
    }
  }, [theme]);

  return { theme, toggleTheme };
}
