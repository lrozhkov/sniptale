// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { translate } from '../../../platform/i18n';
import { VideoEditorSourceViewer } from './source-viewer';

type Props = ComponentProps<typeof VideoEditorSourceViewer>;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let props: Props;
const pause = vi.fn();
const play = vi.fn(() => Promise.resolve());
const load = vi.fn();
function asset(name = 'Screen.webm', type: VideoProjectAssetType = VideoProjectAssetType.VIDEO) {
  return createVideoProjectAsset(
    name,
    type,
    { kind: 'project-asset', projectAssetId: name },
    {
      width: 1280,
      height: 720,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  props = {
    asset: asset(),
    assetUrl: 'blob:source',
    active: true,
    fps: 30,
    onAppend: vi.fn<Props['onAppend']>(() => ({ status: 'placed', clipId: 'clip' })),
    onInsert: vi.fn<Props['onAppend']>(() => ({ status: 'placed', clipId: 'clip' })),
    onOverlay: vi.fn<Props['onAppend']>(() => ({ status: 'placed', clipId: 'clip' })),
    onPlaced: vi.fn(),
  };
  render();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function render(next: Partial<Props> = {}) {
  props = { ...props, ...next };
  act(() => root.render(<VideoEditorSourceViewer {...props} />));
}
function media() {
  return container.querySelector<HTMLMediaElement>('video, audio')!;
}
function ready() {
  act(() => media().dispatchEvent(new Event('loadeddata')));
}
function at(time: number) {
  act(() => {
    media().currentTime = time;
    media().dispatchEvent(new Event('timeupdate'));
  });
}
function key(code: string) {
  act(() =>
    container
      .querySelector('[data-ui="video-editor.source-viewer"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
  );
}
function button(keyName: Parameters<typeof translate>[0]) {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
  return (buttons.find((button) => button.textContent === translate(keyName)) ??
    buttons.find((button) => button.getAttribute('aria-label') === translate(keyName)))!;
}
function marks() {
  const range = container.querySelector<HTMLElement>('[data-ui="video-editor.source-range"]')!;
  return { start: Number(range.dataset['in']), end: Number(range.dataset['out']) };
}

it('keeps source inspection independent and inserts the marked displayed frames with an exclusive Out', () => {
  expect(button('videoEditor.app.sourceInsert').disabled).toBe(true);
  ready();
  at(1);
  key('KeyI');
  at(2);
  key('KeyO');
  expect(props.onInsert).not.toHaveBeenCalled();
  expect(marks()).toEqual({ start: 1, end: 2 + 1 / 30 });
  act(() => button('videoEditor.app.sourceInsert').click());
  expect(props.onInsert).toHaveBeenCalledWith(props.asset!.id, { start: 1, end: 2 + 1 / 30 });
  expect(props.onAppend).not.toHaveBeenCalled();
  expect(props.onPlaced).toHaveBeenCalledOnce();
});
it('preserves marks and cursor across viewer hiding and source switching', () => {
  ready();
  at(1);
  key('KeyI');
  at(2);
  key('KeyO');
  const original = props.asset;
  render({ active: false });
  expect(pause).toHaveBeenCalled();
  render({ active: true });
  expect(marks().start).toBe(1);
  render({ asset: asset('second.webm'), assetUrl: 'blob:second' });
  ready();
  at(3);
  key('KeyI');
  render({ asset: original, assetUrl: 'blob:source' });
  ready();
  expect(marks()).toEqual({ start: 1, end: 2 + 1 / 30 });
  expect(media().currentTime).toBe(2);
});
it('creates a one-frame range when marks cross and allows resetting the full source', () => {
  ready();
  at(1);
  key('KeyO');
  at(3);
  key('KeyI');
  expect(marks()).toEqual({ start: 3, end: 3 + 1 / 30 });
  at(0);
  key('KeyO');
  expect(marks()).toEqual({ start: 0, end: 1 / 30 });
  act(() => button('videoEditor.app.sourceReset').click());
  expect(marks()).toEqual({ start: 0, end: 4 });
});
it('preserves the recoverable range after a locked-track refusal and retries placement', () => {
  ready();
  at(1);
  key('KeyI');
  const append = vi.fn<Props['onAppend']>(() => ({ status: 'rejected', reason: 'locked-track' }));
  render({ onAppend: append });
  act(() => button('videoEditor.app.sourceAppend').click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    translate('videoEditor.app.materialsLocked')
  );
  expect(props.onPlaced).not.toHaveBeenCalled();
  expect(marks().start).toBe(1);
  append.mockReturnValue({ status: 'placed', clipId: 'clip' });
  act(() => button('videoEditor.app.sourceAppend').click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(props.onPlaced).toHaveBeenCalledOnce();
});
it('routes source keyboard transport and frame stepping without wrapping at the source edges', async () => {
  ready();
  key('End');
  expect(media().currentTime).toBeCloseTo(4 - 1 / 30);
  key('Period');
  expect(media().currentTime).toBeCloseTo(4 - 1 / 30);
  key('Home');
  key('Comma');
  expect(media().currentTime).toBe(0);
  key('Period');
  expect(media().currentTime).toBeCloseTo(1 / 30);
  await act(async () => key('Space'));
  expect(play).toHaveBeenCalledOnce();
});
it('rejects missing media and surfaces decoding failure with a real reload action', () => {
  render({ assetUrl: undefined });
  expect(button('videoEditor.app.sourceAppend').disabled).toBe(true);
  render({ assetUrl: 'blob:source' });
  ready();
  act(() => media().dispatchEvent(new Event('error')));
  expect(button('videoEditor.app.sourceAppend').disabled).toBe(true);
  act(() => button('videoEditor.app.sourceRetry').click());
  expect(load).toHaveBeenCalledOnce();
  ready();
  expect(button('videoEditor.app.sourceAppend').disabled).toBe(false);
});
it('ignores a late play rejection after leaving Source and pauses the actual node on unmount', async () => {
  ready();
  let reject: (error: Error) => void = () => {};
  play.mockImplementationOnce(
    () =>
      new Promise<void>((_, no) => {
        reject = no;
      })
  );
  key('Space');
  render({ active: false });
  await act(async () => reject(new Error('interrupted')));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  const before = pause.mock.calls.length;
  render({ asset: null });
  expect(pause.mock.calls.length).toBeGreaterThan(before);
});
it('places an image as a whole asset without timing controls and admits separately captured audio', () => {
  render({ asset: asset('Image.png', VideoProjectAssetType.IMAGE), assetUrl: 'blob:image' });
  act(() => container.querySelector('img')!.dispatchEvent(new Event('load')));
  expect(container.querySelector('[data-ui="video-editor.source-range"]')).toBeNull();
  act(() => button('videoEditor.app.sourceOverlay').click());
  expect(props.onOverlay).toHaveBeenCalledWith(props.asset!.id, undefined);
  render({ asset: asset('Mic.webm', VideoProjectAssetType.AUDIO), assetUrl: 'blob:audio' });
  ready();
  at(1);
  key('KeyI');
  act(() => button('videoEditor.app.sourceOverlay').click());
  expect(props.onOverlay).toHaveBeenLastCalledWith(props.asset!.id, { start: 1, end: 4 });
});

it('aligns marks made during playback with the displayed frame and stops at admitted source duration', () => {
  ready();
  at(1.047);
  key('KeyI');
  expect(marks().start).toBeCloseTo(31 / 30);
  at(4.2);
  expect(media().currentTime).toBeCloseTo(4 - 1 / 30);
  expect(pause).toHaveBeenCalled();
});

it.each(['invalid-cut', 'invalid-range', 'missing-material'] as const)(
  'keeps source marks after %s refusal',
  (reason) => {
    ready();
    at(1);
    key('KeyI');
    render({ onInsert: () => ({ status: 'rejected', reason }) });
    act(() => button('videoEditor.app.sourceInsert').click());
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(marks().start).toBe(1);
    expect(props.onPlaced).not.toHaveBeenCalled();
  }
);

it('lets native range controls own their keyboard input and ignores inactive viewer commands', () => {
  ready();
  act(() =>
    container
      .querySelector('[role="slider"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }))
  );
  expect(marks().start).toBe(0);
  render({ active: false });
  key('Period');
  expect(media().currentTime).toBe(0);
});

it('shows a current play rejection and reloads a failed image with a fresh element', async () => {
  ready();
  play.mockRejectedValueOnce(new Error('decode'));
  await act(async () => key('Space'));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    translate('videoEditor.app.sourcePlayFailed')
  );
  render({ asset: asset('Image.png', VideoProjectAssetType.IMAGE), assetUrl: 'blob:image' });
  const previous = container.querySelector('img')!;
  act(() => previous.dispatchEvent(new Event('error')));
  act(() => button('videoEditor.app.sourceRetry').click());
  expect(container.querySelector('img')).not.toBe(previous);
  act(() => container.querySelector('img')!.dispatchEvent(new Event('load')));
  expect(button('videoEditor.app.sourceAppend').disabled).toBe(false);
});

it('marks the native media position between timeupdate events and updates cursor and range together', () => {
  ready();
  at(1);
  media().currentTime = 1.2;
  key('KeyI');
  expect(marks().start).toBe(1.2);
  expect(container.querySelector('[data-source-counter]')?.textContent).toBe('0:01:06');
  media().currentTime = 2.2;
  key('KeyO');
  expect(marks().end).toBeCloseTo(2.2 + 1 / 30);
  expect(container.querySelector('[data-source-counter]')?.textContent).toBe('0:02:06');
});

it('steps from the native frame between published updates for keyboard and buttons', () => {
  ready();
  at(1);
  media().currentTime = 1.2;
  key('Period');
  expect(media().currentTime).toBeCloseTo(1.2 + 1 / 30);
  media().currentTime = 2.2;
  act(() => button('videoEditor.timeline.previousFrame').click());
  expect(media().currentTime).toBeCloseTo(2.2 - 1 / 30);
});

it('advances repeated steps and marks when native media rounds seeks to microseconds', () => {
  ready();
  for (let index = 0; index < 30; index += 1) {
    key('Period');
    at(Math.floor(media().currentTime * 1e6) / 1e6);
  }
  key('KeyI');
  expect(marks().start).toBe(1);
  expect(container.querySelector('[data-source-counter]')?.textContent).toBe('0:01:00');
});

it('owns Space globally while active, preserves text input, and releases it when inactive', async () => {
  ready();
  const outside = document.createElement('button');
  const text = document.createElement('input');
  document.body.append(outside, text);
  const dispatch = (target: Element) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Space' });
    target.dispatchEvent(event);
    return event;
  };
  try {
    await act(async () => {
      expect(dispatch(outside).defaultPrevented).toBe(true);
    });
    expect(play).toHaveBeenCalledOnce();
    expect(props.onAppend).not.toHaveBeenCalled();
    await act(async () => {
      expect(dispatch(text).defaultPrevented).toBe(false);
    });
    expect(play).toHaveBeenCalledOnce();
    render({ active: false });
    await act(async () => {
      expect(dispatch(outside).defaultPrevented).toBe(false);
    });
    expect(play).toHaveBeenCalledOnce();
  } finally {
    outside.remove();
    text.remove();
  }
});
