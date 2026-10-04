// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ load: vi.fn(), capture: vi.fn() }));
vi.mock('./runtime/video-frame', () => ({
  loadGuideVideoSource: io.load,
  captureGuideVideoFrame: io.capture,
}));
import { GuideVideoFrameResources } from './video-frame-resources';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const submit = vi.fn();
function button(name: string) {
  const node = [...host.querySelectorAll('button')].find((node) => node.textContent === name);
  if (!node) throw new Error('Missing button');
  return node;
}
async function open(onAddTextStep?: (title: string, description: string) => boolean) {
  await act(async () =>
    root.render(
      <GuideVideoFrameResources
        mediaId="video"
        disabled={false}
        {...(onAddTextStep ? { onAddTextStep } : {})}
        onImport={submit}
        t={createTranslator('en')}
      />
    )
  );
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'error', { value: null, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  Object.defineProperty(video, 'duration', { value: 5, configurable: true });
  await act(async () => video.dispatchEvent(new Event('loadeddata', { bubbles: true })));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:video'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  io.load.mockResolvedValue({
    blob: new Blob(['video']),
    filename: 'video.webm',
    recordingId: 'recording',
  });
  io.capture.mockResolvedValue({ blob: new Blob(['png']), timeSeconds: 2 });
  submit.mockResolvedValue(true);
  host = document.createElement('div');
  root = createRoot(host);
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('imports one independent frame, preserves source for another capture, and unloads on close', async () => {
  await open();
  await act(async () => {
    button('Add frame as step').click();
    button('Add frame as step').click();
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0]![0]).toMatchObject({
    sources: [
      {
        kind: 'video-frame',
        source: { recordingId: 'recording', filename: 'video.webm', timeSeconds: 2 },
      },
    ],
    placement: { kind: 'steps' },
  });
  expect(host.querySelector('video')).not.toBeNull();
  await act(async () => button('Add frame as step').click());
  expect(submit).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
});
it('keeps recovery controls on import failure and rejects late capture after cancellation', async () => {
  await open();
  submit.mockResolvedValueOnce(false);
  await act(async () => button('Add frame as step').click());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  let done: ((value: { blob: Blob; timeSeconds: number }) => void) | undefined;
  io.capture.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      })
  );
  await act(async () => button('Add frame as step').click());
  await act(async () => button('Cancel').click());
  expect(io.capture.mock.calls[1]![1].aborted).toBe(true);
  await act(async () => done?.({ blob: new Blob(['late']), timeSeconds: 3 }));
  expect(submit).toHaveBeenCalledTimes(1);
});
it('does not retain a late source URL after closing', async () => {
  let done: ((value: { blob: Blob; filename: string; recordingId: null }) => void) | undefined;
  io.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      })
  );
  await act(async () =>
    root.render(
      <GuideVideoFrameResources
        mediaId="video"
        disabled={false}
        onImport={submit}
        t={createTranslator('en')}
      />
    )
  );
  await act(async () => root.render(null));
  await act(async () =>
    done?.({ blob: new Blob(['late']), filename: 'late.webm', recordingId: null })
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('retries a failed source without leaving the selected video and releases its URL', async () => {
  io.load.mockRejectedValueOnce(new Error('source changed'));
  await act(async () =>
    root.render(
      <GuideVideoFrameResources
        mediaId="video"
        disabled={false}
        onImport={submit}
        t={createTranslator('en')}
      />
    )
  );
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => button('Retry').click());
  expect(io.load).toHaveBeenCalledTimes(2);
  expect(io.load.mock.calls[0]![1].aborted).toBe(true);
  expect(io.load.mock.calls[1]![0]).toEqual({ mediaId: 'video' });
  expect(host.querySelector('video')).not.toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => root.render(null));
  expect(io.load.mock.calls[1]![1].aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
});

it('attaches the active action and omits it after seeking outside its interval', async () => {
  const action = {
    id: 'click',
    kind: 'CLICK',
    time: 2,
    duration: 0.5,
    label: 'Open',
    point: null,
    target: null,
  };
  io.load.mockResolvedValue({
    blob: new Blob(['video']),
    filename: 'video.webm',
    recordingId: 'recording',
    actions: [action],
  });
  await open();
  await act(async () => button('Add frame as step').click());
  expect(submit.mock.calls[0]![0].sources[0].source.action).toEqual(action);
  io.capture.mockResolvedValue({ blob: new Blob(['png']), timeSeconds: 3 });
  await act(async () => button('Add frame as step').click());
  expect(submit.mock.calls[1]![0].sources[0].source.action).toBeUndefined();
});

it('keeps capture actions inside the actual player fullscreen root', async () => {
  await open();
  const player = host.querySelector('[data-ui="library-media-player"]')!;
  expect(player.contains(button('Add frame as step'))).toBe(true);
});

it('opens and cancels a frameless composer inside the player without changing the video', async () => {
  const addText = vi.fn(() => true);
  await open(addText);
  const player = host.querySelector('[data-ui="library-media-player"]')!;
  const video = host.querySelector('video')!;
  video.currentTime = 2;
  expect(host.querySelector('[aria-label="Step title"]')).toBeNull();
  await act(async () => button('Add step without frame').click());
  expect(player.contains(host.querySelector('[aria-label="Step title"]'))).toBe(true);
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Step title"]'));
  expect(player.contains(button('Cancel'))).toBe(true);
  await act(async () => button('Cancel').click());
  expect(host.querySelector('[aria-label="Step title"]')).toBeNull();
  await act(async () => button('Add step without frame').click());
  expect(host.querySelector('[aria-label="Step title"]')).not.toBeNull();
  expect(host.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(2);
  expect(addText).not.toHaveBeenCalled();
  expect(io.capture).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

async function writeField(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`
  )!;
  const prototype =
    field.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('retains a cancelled draft and creates exactly one text step without capture or import', async () => {
  const addText = vi.fn(() => true);
  await open(addText);
  await act(async () => button('Add step without frame').click());
  await writeField('Step title', 'Text only');
  const body = host.querySelector<HTMLTextAreaElement>('[aria-label="Text"]')!;
  body.focus();
  await writeField('Text', 'Details');
  expect(document.activeElement).toBe(body);
  const form = host.querySelector('form')!;
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => form.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(host.querySelector('form')).toBeNull();
  expect(document.activeElement).toBe(button('Add step without frame'));
  await act(async () => button('Add step without frame').click());
  expect(host.querySelector<HTMLInputElement>('[aria-label="Step title"]')!.value).toBe(
    'Text only'
  );
  const save = button('Save');
  await act(async () => {
    save.click();
    save.click();
  });
  expect(addText).toHaveBeenCalledTimes(1);
  expect(addText).toHaveBeenCalledWith('Text only', 'Details');
  expect(io.capture).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(host.querySelector('form')).toBeNull();
});

it('keeps rejected text draft retryable and preserves frame metadata capture', async () => {
  const addText = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  await open(addText);
  await act(async () => button('Add step without frame').click());
  await writeField('Step title', 'Retry title');
  await act(async () => button('Save').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not add step');
  expect(host.querySelector('form')).not.toBeNull();
  await act(async () => button('Save').click());
  expect(addText).toHaveBeenCalledTimes(2);
  await act(async () => button('Edit step details').click());
  await act(async () => button('Use this frame').click());
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0]![0].sources[0].title).toBe('Retry title');
});
