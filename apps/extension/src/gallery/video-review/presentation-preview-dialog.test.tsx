// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewPresentationPreviewDialog } from './presentation-preview-dialog';

const locale = vi.hoisted(() => ({ value: 'en' as 'en' | 'ru' }));
vi.mock('../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: () => locale.value,
    translate: (key: Parameters<typeof actual.translate>[0]) => actual.translate(key, locale.value),
  };
});
let root: Root;
let host: HTMLDivElement;
let parent: HTMLDialogElement;
let trigger: HTMLButtonElement;
let props: ComponentProps<typeof ReviewPresentationPreviewDialog>;
let paused: boolean;
let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
let pause: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  locale.value = 'en';
  paused = true;
  play = vi.fn(async () => {
    paused = false;
  });
  pause = vi.fn(() => {
    paused = true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  parent = document.createElement('dialog');
  parent.open = true;
  trigger = document.createElement('button');
  trigger.textContent = 'Open join';
  host = document.createElement('div');
  parent.append(trigger, host);
  document.body.append(parent);
  trigger.focus();
  root = createRoot(host);
  props = {
    anchor: host,
    edge: 'intro',
    windows: [
      { id: 'start', label: 'Start' },
      { id: 'join', label: 'Join' },
    ],
    selected: 'join',
    onSelect: vi.fn(),
    url: 'blob:join',
    pending: false,
    error: null,
    onRetry: vi.fn(),
    onClose: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  parent.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ReviewPresentationPreviewDialog {...props} />));
}
function dialog() {
  return document.querySelector<HTMLDialogElement>(
    '[data-ui="gallery.videoReview.presentationPreview"]'
  )!;
}
function key(target: HTMLElement, value: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  act(() => target.dispatchEvent(event));
  return event;
}
it('owns native cancellation and restores the connected trigger without resuming any video', async () => {
  await render();
  expect(dialog().open).toBe(true);
  const cancel = new Event('cancel', { cancelable: true });
  act(() => dialog().dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(props.onClose).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(trigger);
  expect(parent.open).toBe(true);
  expect(play).not.toHaveBeenCalled();
  expect(pause).toHaveBeenCalled();
});
it('toggles only the local video on Space and contains keyboard events', async () => {
  await render();
  const underlying = vi.fn();
  parent.addEventListener('keydown', underlying);
  expect(key(dialog(), ' ').defaultPrevented).toBe(true);
  expect(play).toHaveBeenCalledOnce();
  key(dialog(), ' ', { repeat: true });
  expect(play).toHaveBeenCalledOnce();
  key(dialog(), ' ');
  expect(pause).toHaveBeenCalledOnce();
  const input = document.createElement('input');
  dialog().append(input);
  expect(key(input, ' ').defaultPrevented).toBe(false);
  const button = dialog().querySelector<HTMLButtonElement>('button')!;
  expect(key(button, ' ').defaultPrevented).toBe(false);
  expect(play).toHaveBeenCalledOnce();
  expect(underlying).not.toHaveBeenCalled();
  key(dialog(), 'Escape');
  expect(props.onClose).toHaveBeenCalledOnce();
});
it('pauses the previous source on replacement and never revokes parent-owned URLs', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await render();
  const first = dialog().querySelector('video');
  props = { ...props, url: 'blob:other', selected: 'start' };
  await render();
  expect(pause).toHaveBeenCalledOnce();
  expect(dialog().querySelector('video')).not.toBe(first);
  expect(dialog().querySelector('video')?.getAttribute('src')).toBe('blob:other');
  await act(async () => root.render(null));
  expect(pause).toHaveBeenCalledTimes(2);
  expect(revoke).not.toHaveBeenCalled();
});
it('keeps contextual preview and recovery reachable without a second window selector', async () => {
  props = { ...props, pending: true };
  await render();
  expect(dialog().querySelector('video')).toBeNull();
  expect(dialog().querySelector('[role=status]')).not.toBeNull();
  expect(
    dialog().querySelector('[data-ui="shared.ui.compact-inspector.segmented-row"]')
  ).toBeNull();
  props = { ...props, pending: false, error: 'Cannot prepare this join' };
  await render();
  expect(dialog().querySelector('[role=alert]')?.textContent).toContain('Cannot prepare this join');
  const retry = [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'Retry'
  )!;
  act(() => retry.click());
  expect(props.onRetry).toHaveBeenCalledOnce();
});

it('localizes the edge title and reports playback rejection with an explicit retry', async () => {
  locale.value = 'ru';
  props = { ...props, edge: 'outro' };
  play.mockRejectedValueOnce(new Error('play denied'));
  await render();
  expect(dialog().getAttribute('aria-label')).toBe('Аутро · Предпросмотр');
  await act(async () => key(dialog(), ' '));
  expect(dialog().querySelector('[role=alert]')?.textContent).toContain(
    'Не удалось воспроизвести просмотр.'
  );
  expect(dialog().querySelector('video')).toBeNull();
});
it('ignores a stale play rejection and does not restore a disconnected trigger', async () => {
  let reject!: (failure: Error) => void;
  play.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  await render();
  key(dialog(), ' ');
  props = { ...props, url: 'blob:new' };
  await render();
  await act(async () => reject(new Error('old source')));
  expect(dialog().querySelector('[role=alert]')).toBeNull();
  const focus = vi.spyOn(trigger, 'focus');
  trigger.remove();
  await act(async () => root.render(null));
  expect(focus).not.toHaveBeenCalled();
});
