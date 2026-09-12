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
async function open() {
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
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'error', { value: null, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  Object.defineProperty(video, 'duration', { value: 5, configurable: true });
  await act(async () => video.dispatchEvent(new Event('loadeddata', { bubbles: true })));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
