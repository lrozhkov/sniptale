// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoRecordingSpotlight } from './view';
import { DEFAULT_VIDEO_CURSOR_EFFECTS } from '@sniptale/runtime-contracts/video/types/types';
import { initializeContentUiRoots } from '../../../platform/dom-host';

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mountClickFeedback() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled={false}
        cursorDimmingEnabled={false}
        clickAnimationEnabled
      />
    )
  );
  return host;
}

function deliver(type: string, clientX = 0, detail = 1) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY: 20, detail });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => document.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
}

const RIPPLE = '[data-ui="content.video-recording.spotlight-click"]';

it.each(['ripple', 'press', 'glow'] as const)(
  'excludes owned toolbar and portal clicks from %s without excluding page controls',
  (clickEffect) => {
    const host = mountClickFeedback();
    act(() =>
      root?.render(
        <VideoRecordingSpotlight
          cursorHaloEnabled={false}
          cursorDimmingEnabled={false}
          clickAnimationEnabled
          cursorEffects={{ ...DEFAULT_VIDEO_CURSOR_EFFECTS, clickEffect }}
        />
      )
    );
    const contentHost = document.createElement('div');
    document.body.append(contentHost);
    const contentRoot = contentHost.attachShadow({ mode: 'open' });
    const { appContainer, overlayRoot } = initializeContentUiRoots(contentRoot);
    for (const container of [appContainer, overlayRoot]) {
      const button = document.createElement('button');
      const icon = document.createElement('span');
      button.append(icon);
      container.append(button);
      const observer = vi.fn();
      button.addEventListener('click', observer);
      act(() => icon.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })));
      expect(host.querySelector(RIPPLE)).toBeNull();
      expect(observer).toHaveBeenCalledOnce();
    }
    const pageHost = document.createElement('div');
    pageHost.className = 'sniptale-app';
    document.body.append(pageHost);
    const pageButton = document.createElement('button');
    pageHost.attachShadow({ mode: 'open' }).append(pageButton);
    act(() => pageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })));
    expect(host.querySelector(RIPPLE)).not.toBeNull();
  }
);

it.each(['ripple', 'press', 'glow'] as const)(
  'renders the live %s style and cleans up after the final pulse',
  (clickEffect) => {
    const host = mountClickFeedback();
    act(() =>
      root?.render(
        <VideoRecordingSpotlight
          cursorHaloEnabled
          cursorDimmingEnabled={false}
          clickAnimationEnabled
          cursorEffects={{
            ...DEFAULT_VIDEO_CURSOR_EFFECTS,
            clickEffect,
            clickColor: '#12345680',
            clickDuration: 1000,
            clickPulses: 2,
            clickStroke: 4,
            clickEasing: 'linear',
            haloStroke: 3,
            haloGlow: 0,
            haloColor: '#123456',
          }}
        />
      )
    );
    deliver('click', 30, 0);
    const effect = host.querySelector<HTMLElement>(RIPPLE)!;
    expect(effect.dataset['effect']).toBe(clickEffect);
    expect(effect.style.animation).toContain('500ms linear 2');
    expect(effect.style.borderStyle).toBe(clickEffect === 'ripple' ? 'solid' : 'none');
    if (clickEffect === 'ripple') expect(effect.style.borderWidth).toBe('4px');
    expect(effect.style.background).toBe(
      clickEffect === 'ripple' ? 'transparent' : 'rgba(18, 52, 86, 0.5)'
    );
    expect(effect.style.boxShadow === 'none').toBe(clickEffect !== 'glow');
    expect(
      host.querySelector<HTMLElement>('[data-ui="content.video-recording.spotlight-halo"]')!.style
        .borderWidth
    ).toBe('3px');
    act(() => {
      effect.dispatchEvent(new Event('animationend', { bubbles: true }));
      effect.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }));
    });
    expect(host.querySelector(RIPPLE)).toBeNull();
  }
);

it('renders accepted appearance values without replacing the native cursor', () => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled
        cursorDimmingEnabled
        clickAnimationEnabled
        cursorEffects={{
          ...DEFAULT_VIDEO_CURSOR_EFFECTS,
          haloSize: 66,
          haloOpacity: 70,
          dimmingRadius: 90,
          dimmingOpacity: 45,
          clickSize: 60,
          clickDuration: 650,
          haloColor: '#2563eb',
          dimmingColor: '#112233',
          clickColor: '#ef4444',
        }}
      />
    )
  );
  const halo = host.querySelector<HTMLElement>(
    '[data-ui="content.video-recording.spotlight-halo"]'
  )!;
  expect(halo.style.width).toBe('66px');
  expect(halo.style.left).toBe('-33px');
  expect(halo.style.opacity).toBe('0.7');
  expect(halo.style.borderColor).toBe('rgb(37, 99, 235)');
  const dimming = host.querySelector<HTMLElement>(
    '[data-ui="content.video-recording.spotlight-dimming"]'
  )!;
  expect(dimming.style.opacity).toBe('0.45');
  expect(dimming.style.backgroundColor).toBe('rgb(17, 34, 51)');
  expect(dimming.style.maskImage).toContain('circle 90px');
  deliver('click', 30, 0);
  const ripple = host.querySelector<HTMLElement>(RIPPLE)!;
  expect(ripple.style.width).toBe('60px');
  expect(ripple.style.borderColor).toBe('rgb(239, 68, 68)');
  expect(ripple.style.animation).toContain('650ms');
  expect(document.documentElement.style.cursor).toBe('');
});

it.each(['selection-drag', 'return-to-origin', 'cancel', 'native-drag', 'blur'])(
  'does not animate %s completion and accepts the next click',
  (gesture) => {
    const host = mountClickFeedback();
    deliver('pointerdown');
    if (gesture === 'selection-drag' || gesture === 'return-to-origin') deliver('pointermove', 30);
    if (gesture === 'cancel') deliver('pointercancel');
    if (gesture === 'native-drag') deliver('dragstart');
    if (gesture === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    const end = gesture === 'selection-drag' ? 30 : 0;
    deliver('pointerup', end);
    deliver('click', end);
    expect(host.querySelector(RIPPLE)).toBeNull();
    deliver('pointerdown', 50);
    deliver('pointerup', 50);
    deliver('click', 50);
    expect(host.querySelector(RIPPLE)).not.toBeNull();
  }
);

it.each([0, 3, 4])('preserves a click with %s CSS px of pointer jitter', (distance) => {
  const host = mountClickFeedback();
  deliver('pointerdown');
  deliver('pointermove', distance);
  deliver('pointerup', distance);
  deliver('click', distance);
  expect(host.querySelector(RIPPLE)).not.toBeNull();
});

it('suppresses a new short text selection without suppressing a click beside an existing selection', () => {
  const host = mountClickFeedback();
  const text = document.createTextNode('Select this text');
  document.body.append(text);
  deliver('pointerdown');
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 1);
  document.getSelection()!.addRange(range);
  deliver('pointerup', 1);
  deliver('click', 1);
  expect(host.querySelector(RIPPLE)).toBeNull();
  deliver('pointerdown', 50);
  deliver('pointerup', 50);
  deliver('click', 50);
  expect(host.querySelector(RIPPLE)).not.toBeNull();
});

it('does not carry drag suppression into a virtual click', () => {
  const host = mountClickFeedback();
  deliver('pointerdown');
  deliver('pointermove', 30);
  deliver('pointerup', 30);
  deliver('click', 30, 0);
  expect(host.querySelector(RIPPLE)).not.toBeNull();
});

it('preserves double-click feedback when the browser selects a word', () => {
  const host = mountClickFeedback();
  const text = document.createTextNode('word');
  document.body.append(text);
  deliver('pointerdown');
  const range = document.createRange();
  range.selectNodeContents(text);
  document.getSelection()!.addRange(range);
  deliver('pointerup');
  deliver('click', 0, 2);
  expect(host.querySelector(RIPPLE)).not.toBeNull();
});

it('does not cancel an ordinary click when focus moves between page controls', () => {
  const host = mountClickFeedback();
  const button = document.createElement('button');
  document.body.append(button);
  deliver('pointerdown');
  act(() => button.dispatchEvent(new Event('blur')));
  deliver('pointerup');
  deliver('click');
  expect(host.querySelector(RIPPLE)).not.toBeNull();
});

it('removes gesture tracking when click feedback is disabled but halo stays enabled', () => {
  mountClickFeedback();
  deliver('pointerdown');
  const remove = vi.spyOn(document, 'removeEventListener');
  const removeWindow = vi.spyOn(window, 'removeEventListener');
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled
        cursorDimmingEnabled={false}
        clickAnimationEnabled={false}
      />
    )
  );
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'dragstart', 'click']) {
    expect(remove).toHaveBeenCalledWith(type, expect.any(Function), true);
  }
  expect(removeWindow).toHaveBeenCalledWith('blur', expect.any(Function), true);
  remove.mockRestore();
  removeWindow.mockRestore();
});

it('does not subscribe to page pointer events while every effect is disabled', () => {
  const addEventListener = vi.spyOn(document, 'addEventListener');
  const host = document.createElement('div');
  root = createRoot(host);
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled={false}
        cursorDimmingEnabled={false}
        clickAnimationEnabled={false}
      />
    )
  );

  expect(addEventListener).not.toHaveBeenCalledWith('pointermove', expect.any(Function), true);
  addEventListener.mockRestore();
});

it('renders independently selected pointer effects without delaying the page event', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <VideoRecordingSpotlight
        cursorHaloEnabled={false}
        cursorDimmingEnabled
        clickAnimationEnabled
      />
    )
  );

  let pageClickObserved = false;
  document.addEventListener(
    'click',
    () => {
      pageClickObserved = true;
    },
    { once: true }
  );
  act(() => {
    document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 80, clientY: 45 }));
  });

  const overlay = host.querySelector<HTMLElement>('[data-ui="content.video-recording.spotlight"]');
  expect(pageClickObserved).toBe(true);
  expect(overlay?.style.pointerEvents).toBe('none');
  expect(host.querySelector('[data-ui="content.video-recording.spotlight-halo"]')).toBeNull();
  expect(
    host.querySelector('[data-ui="content.video-recording.spotlight-dimming"]')
  ).not.toBeNull();
  expect(
    host.querySelector('[data-ui="content.video-recording.spotlight-click"]')?.getAttribute('style')
  ).toContain('sniptale-recording-click-ripple 420ms');
});
