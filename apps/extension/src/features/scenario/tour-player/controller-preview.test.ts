// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml } from './document';
import { createTourPlayer } from './controller';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['slide', 'object'])(
  'keeps camera preview silent with unavailable %s entry narration',
  async (target) => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const labels = {
      expand: 'expand',
      collapse: 'collapse',
      previous: 'previous',
      next: 'next',
      contents: 'contents',
      close: 'close',
      restart: 'restart',
      finished: 'finished',
      empty: 'empty',
      point: 'point',
      details: 'details',
      play: 'play',
      pause: 'pause',
      seek: 'seek',
      retry: 'retry',
      loading: 'loading',
      mediaError: 'media failed',
      choose: 'choose',
    };
    const tour = createTourDocument();
    const slide = createTourImageSlide('first');
    tour.slides = [slide];
    const html = await buildTourPlayerHtml({ tour, title: 'Camera', labels, assets: [] });
    const root = new DOMParser().parseFromString(html, 'text/html').getElementById('tour-player')!;
    document.body.append(root);
    const player = createTourPlayer(root, { tour, labels, assets: [] }, { preview: true });
    try {
      tour.transition = { kind: 'fade', durationMs: 100, hotspotTravelMs: 0 };
      const narration = {
        assetId: 'voice',
        duration: 2,
        trimStart: 0,
        trimEnd: 2,
        gain: 1,
        transcript: '',
        trigger: 'enter' as const,
      };
      if (target === 'slide') slide.narration = narration;
      else
        slide.hotspots = [
          {
            id: 'point',
            point: { x: 0.5, y: 0.5 },
            targetRect: null,
            label: 'Point',
            text: '',
            action: { kind: 'none' },
            appearance: null,
            pulse: false,
            narration,
          },
        ];
      player.update({ tour, labels, assets: [] });
      await vi.advanceTimersByTimeAsync(50);
      const opacity = Number(
        root.querySelector<HTMLElement>('.tour-motion-previous')!.style.opacity
      );
      expect(opacity).toBeLessThan(1);
      expect(opacity).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(100);
      expect(root.querySelector<HTMLElement>('[data-tour-scene]')!.inert).toBe(false);
      expect(root.querySelector('audio')?.getAttribute('src')).toBeNull();
      expect(root.querySelector('[role=status]')!.textContent).not.toContain(labels.mediaError);
    } finally {
      player.dispose();
      root.remove();
    }
  }
);
