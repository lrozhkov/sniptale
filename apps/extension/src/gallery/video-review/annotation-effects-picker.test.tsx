// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogListItem,
} from '../../features/video/project/effect-bundle/catalog';
import { reviewKeyboardTarget } from './keyboard-context';
import { getCurrentLocale, translate } from '../../platform/i18n';
import { ReviewAnnotationEffectsPicker } from './annotation-effects-picker';

let dialog: HTMLDialogElement;
let anchor: HTMLButtonElement;
let root: Root;
let host: HTMLDivElement;
let resize: () => void;
const close = vi.fn();
const choose = vi.fn();
const reload = vi.fn();
const retry = vi.fn();
const label = { en: 'Visible title', ru: 'Видимый заголовок' };
const catalog: EffectBundleCatalogEntry = {
  packId: 'pack',
  source: 'builtin',
  label,
  description: { en: '', ru: '' },
  assets: [],
  documents: [
    {
      id: 'title',
      kind: 'standalone',
      schemaVersion: 'sniptale.effect.v1',
      sha256: 'hash',
      assets: [],
      presentation: { label, duration: 4 },
    },
    {
      id: 'transition',
      kind: 'transition',
      schemaVersion: 'sniptale.effect.v1',
      sha256: 'hash',
      assets: [],
    },
    {
      id: 'target',
      kind: 'targetEffect',
      schemaVersion: 'sniptale.effect.v1',
      sha256: 'hash',
      assets: [],
    },
    {
      id: 'disabled',
      kind: 'standalone',
      enabled: false,
      schemaVersion: 'sniptale.effect.v1',
      sha256: 'hash',
      assets: [],
    },
  ],
  enabled: true,
  retainedByteLength: 0,
  sourceSha256: 'hash',
  version: '1',
  createdAt: 0,
  updatedAt: 0,
};
const catalogs: EffectBundleCatalogListItem[] = [
  {
    status: 'ready',
    entry: catalog,
    packId: catalog.packId,
    source: 'builtin',
    label,
    enabled: true,
    retainedByteLength: 0,
    version: '1',
    createdAt: 0,
    updatedAt: 0,
    documentKinds: ['standalone', 'transition', 'targetEffect'],
  },
];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 560);
  vi.stubGlobal(
    'ResizeObserver',
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.clearAllMocks();
  dialog = document.createElement('dialog');
  dialog.open = true;
  dialog.dataset['ui'] = 'gallery.videoReview.dialog';
  dialog.dataset['theme'] = 'dark';
  host = document.createElement('div');
  anchor = document.createElement('button');
  dialog.append(anchor, host);
  document.body.append(dialog);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 480, 32, 32));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dialog.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(
  overrides: Partial<Parameters<typeof ReviewAnnotationEffectsPicker>[0]> = {}
) {
  await act(async () =>
    root.render(
      <ReviewAnnotationEffectsPicker
        anchor={anchor}
        target={dialog}
        catalogs={catalogs}
        phase="ready"
        pending={false}
        failure={null}
        onChoose={choose}
        onReload={reload}
        onRetry={retry}
        onClose={close}
        {...overrides}
      />
    )
  );
  return dialog.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.annotationEffectsPicker"]'
  )!;
}

it('uses dialog/theme, lists enabled standalone choices and returns the lazy catalog', async () => {
  const surface = await render();
  expect(surface.closest('dialog')).toBe(dialog);
  expect(surface.dataset['theme']).toBe('dark');
  const buttons = [...surface.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons).toHaveLength(2);
  const choice = buttons.find((button) => button.textContent === label[getCurrentLocale()])!;
  await act(async () => choice.click());
  expect(choose).toHaveBeenCalledExactlyOnceWith(catalog, 'title');
  expect(close).not.toHaveBeenCalled();
});

it('owns initial focus, Tab wrapping, Escape, playback exclusion and restoration', async () => {
  const surface = await render();
  const layer = surface.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.activeElement).toBe(layer);
  expect(reviewKeyboardTarget({ target: anchor })).toBeNull();
  const buttons = [...surface.querySelectorAll<HTMLButtonElement>('button')];
  await act(async () =>
    layer.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }))
  );
  expect(document.activeElement).toBe(buttons.at(-1));
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })
    )
  );
  expect(document.activeElement).toBe(buttons[0]);
  await act(async () =>
    layer.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(anchor);
});

it('rejects duplicate choices while pending and exposes catalog and acquisition recovery', async () => {
  let surface = await render({ pending: true });
  const choice = [...surface.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === label[getCurrentLocale()]
  )!;
  expect(choice.disabled).toBe(true);
  await act(async () => choice.click());
  expect(choose).not.toHaveBeenCalled();
  expect(surface.querySelector('[role="status"]')?.textContent).toBe(
    translate('gallery.videoReview.annotationEffectsAdding')
  );
  surface = await render({ catalogs: [], phase: 'failed' });
  expect(surface.querySelector('[role="alert"]')?.textContent).toContain(
    translate('gallery.videoReview.annotationEffectsCatalogFailed')
  );
  await act(async () => surface.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
  expect(reload).toHaveBeenCalledTimes(1);
  surface = await render({ failure: translate('gallery.videoReview.annotationEffectsAddFailed') });
  await act(async () => surface.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
  expect(retry).toHaveBeenCalledTimes(1);
  surface = await render({ catalogs: [] });
  expect(surface.textContent).toContain(
    translate('gallery.videoReview.annotationEffectsCatalogEmpty')
  );
});

it('tracks the viewport and ancestor scrolling, dismissing when the anchor leaves its scroll owner', async () => {
  const surface = await render();
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 220));
  await act(async () => resize());
  const positioner = surface.parentElement!;
  expect(positioner.style.left).toBe('300px');
  expect(positioner.style.top).toBe('254px');
  vi.mocked(anchor.getBoundingClientRect).mockReturnValue(new DOMRect(1100, 60, 32, 32));
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(positioner.style.left).toBe('908px');
  expect(positioner.style.top).toBe('98px');
  dialog.style.overflowY = 'auto';
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 1280, 200));
  await act(async () => dialog.dispatchEvent(new Event('scroll')));
  expect(close).toHaveBeenCalledTimes(1);
});

it('contains wheel events and detects composed outside clicks', async () => {
  const surface = await render();
  const inside = new MouseEvent('pointerdown', { bubbles: true });
  Object.defineProperty(inside, 'composedPath', { value: () => [surface, dialog, document] });
  await act(async () => document.dispatchEvent(inside));
  expect(close).not.toHaveBeenCalled();
  const outerWheel = vi.fn();
  dialog.addEventListener('wheel', outerWheel);
  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
  surface.dispatchEvent(wheel);
  expect(outerWheel).not.toHaveBeenCalled();
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  );
  expect(close).toHaveBeenCalledTimes(1);
});

it('explains a permanent unsupported choice and keeps other choices available', async () => {
  const message = translate('gallery.videoReview.annotationEffectsUnsupported');
  const surface = await render({ failure: message, retryable: false });
  const alert = surface.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(message);
  expect(alert?.querySelector('button')).toBeNull();
  const choice = [...surface.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === label[getCurrentLocale()]
  );
  if (!choice) throw new Error('Missing available catalog choice.');
  expect(choice.disabled).toBe(false);
  await act(async () => choice.click());
  expect(choose).toHaveBeenCalledWith(catalog, 'title');
  expect(retry).not.toHaveBeenCalled();
});
