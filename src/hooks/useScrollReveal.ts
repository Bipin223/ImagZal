import { useEffect } from 'react';

export function useScrollReveal(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    let frame = 0;

    const check = () => {
      frame = 0;
      const viewportHeight = window.innerHeight;
      for (const element of elements) {
        if (element.classList.contains('is-visible')) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top < viewportHeight * 0.94 && rect.bottom > 0) {
          element.classList.add('is-visible');
        }
      }
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);
}
