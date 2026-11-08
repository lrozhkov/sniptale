import { VideoSample } from 'mediabunny';
import { translate } from '../../../../../platform/i18n';
import * as normalization from '../../../../../features/video/composition/draw/decoded-sample';
import type { GpuPreviewTargetFactory } from '../../../../../features/video/composition/canvas/preview-presentation';
import * as presentation from '../../../../../features/video/composition/canvas/preview-presentation';
import { WorkspacePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES } from '../../../../../composition/persistence/video-editor-preview-preferences/model';

import type { CameraAppearance } from '../../../../../features/video/project/camera/appearance';
const sources = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../../../../workflows/video/preview-source', () => ({
  createPreviewSourceProvider: sources.create,
}));
const gpu = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../../../features/video/composition/canvas/camera-crop-gpu', () => ({
  createCameraCropGpuRenderer: gpu.create,
}));
// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CameraCropPreview } from './camera-crop-preview';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../../features/video/project/camera/appearance';

let container: HTMLDivElement, root: Root;
const load = vi.fn(),
  draw = vi.fn();
const context = {
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  drawImage: draw,
  translate: vi.fn(),
  scale: vi.fn(),
};
const observations: { notify: () => void; disconnected: boolean }[] = [];
const observe = vi.fn();
beforeEach(() => {
  sources.acquire.mockReset().mockResolvedValue(null);
  sources.retain.mockReset();
  sources.dispose.mockReset();
  sources.create.mockReturnValue({
    acquire: sources.acquire,
    retainSources: sources.retain,
    dispose: sources.dispose,
  });
  observations.length = 0;
  observe.mockClear();
  gpu.create.mockReturnValue({ render: vi.fn(async () => undefined), dispose: vi.fn() });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private entry: { notify: () => void; disconnected: boolean };
      constructor(callback: () => void) {
        this.entry = { notify: callback, disconnected: false };
        observations.push(this.entry);
      }
      observe() {
        observe();
        queueMicrotask(() => {
          if (!this.entry.disconnected) this.entry.notify();
        });
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 150,
    width: 200,
    height: 150,
    toJSON() {},
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function props() {
  return {
    url: 'blob:camera',
    sourceTime: 0.5,
    width: 200,
    height: 150,
    appearance: { ...DEFAULT_CAMERA_APPEARANCE, zoom: 2 },
    disabled: false,
    onChange: vi.fn(),
  };
}
function button() {
  return container.querySelector('button')!;
}
function ready() {
  const video = container.querySelector('video')!;
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  Object.defineProperty(video, 'seeking', { value: false, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
  act(() => {
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('seeked'));
  });
  return video;
}
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => button().dispatchEvent(event));
}
it('decodes once, previews a drag and commits it once without moving the playhead or reloading', async () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  expect(button().disabled).toBe(true);
  const video = ready();
  await act(async () => {});
  expect(video.currentTime).toBe(0.5);
  expect(button().disabled).toBe(false);
  const count = load.mock.calls.length;
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 65);
  expect(p.onChange).not.toHaveBeenCalled();
  expect(button().style.cursor).toBe('grabbing');
  pointer('pointerup', 120, 65);
  expect(p.onChange).toHaveBeenCalledOnce();
  expect(p.onChange).toHaveBeenCalledWith({ ...p.appearance, panX: -0.2, panY: 2 / 15 });
  act(() =>
    root.render(<CameraCropPreview {...p} appearance={{ ...p.appearance, roundness: 50 }} />)
  );
  expect(load.mock.calls.length).toBe(count);
  expect(draw).toHaveBeenCalled();
});
it('cancels pointer edits, supports keyboard and resets a gesture when locked', () => {
  const p = props();
  act(() =>
    root.render(
      <>
        <CameraCropPreview {...p} />
        <input aria-label="Other control" />
      </>
    )
  );
  ready();
  container.querySelector('input')!.focus();
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 65);
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
  );
  pointer('pointerup', 120, 65);
  expect(p.onChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button());
  act(() =>
    button().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
  );
  expect(p.onChange).toHaveBeenCalledWith({ ...p.appearance, panX: 0.1 });
  p.onChange.mockClear();
  pointer('pointerdown', 100, 75);
  pointer('pointercancel', 100, 75);
  pointer('pointerup', 100, 75);
  expect(p.onChange).not.toHaveBeenCalled();
  pointer('pointerdown', 100, 75);
  act(() => root.render(<CameraCropPreview {...p} disabled />));
  expect(button().disabled).toBe(true);
});
it('keeps failed media recoverable and releases its source when unmounted', () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  const video = container.querySelector('video')!;
  act(() => video.dispatchEvent(new Event('error')));
  expect(button().disabled).toBe(true);
  const retry = container.querySelectorAll('button')[1]!;
  const count = load.mock.calls.length;
  act(() => retry.click());
  expect(load.mock.calls.length).toBe(count + 1);
  ready();
  expect(button().disabled).toBe(false);
  act(() => root.render(null));
  expect(video.hasAttribute('src')).toBe(false);
});

it('keeps mirrored crop dragging and keyboard movement in the visible direction', async () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} mirrored />));
  ready();
  await act(async () => {});
  expect(context.scale).toHaveBeenCalledWith(-1, 1);
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 65);
  pointer('pointerup', 120, 65);
  expect(p.onChange).toHaveBeenCalledWith({ ...p.appearance, panX: 0.2, panY: 2 / 15 });
  p.onChange.mockClear();
  act(() =>
    button().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
  );
  expect(p.onChange).toHaveBeenCalledWith({ ...p.appearance, panX: -0.1 });
});

it('uses a square circle preview and retains mirrored pan semantics', () => {
  const p = {
    ...props(),
    mirrored: true,
    appearance: { ...DEFAULT_CAMERA_APPEARANCE, shape: 'circle' as const, zoom: 2 },
  };
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  expect(button().style.aspectRatio).toBe('150 / 150');
  expect(button().style.maxWidth).toBe('176px');
  const bounds = button().getBoundingClientRect();
  vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue({
    ...bounds,
    width: 150,
    height: 150,
    right: 150,
    bottom: 150,
  });
  pointer('pointerdown', 10, 10);
  pointer('pointermove', 25, 10);
  pointer('pointerup', 25, 10);
  expect(p.onChange).toHaveBeenCalledExactlyOnceWith({ ...p.appearance, panX: 0.12 });
});

it('seeks the latest source time without reloading the same camera source', () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  const video = ready();
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  const count = load.mock.calls.length;
  act(() => root.render(<CameraCropPreview {...p} sourceTime={3} />));
  expect(load).toHaveBeenCalledTimes(count);
  expect(video.currentTime).toBe(3);
  act(() => root.render(<CameraCropPreview {...p} sourceTime={4} />));
  expect(load).toHaveBeenCalledTimes(count);
  expect(video.currentTime).toBe(4);
});

it('uses the latest requested time when camera metadata arrives late', () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  const video = container.querySelector('video')!;
  const count = load.mock.calls.length;
  act(() => root.render(<CameraCropPreview {...p} sourceTime={3} />));
  expect(load).toHaveBeenCalledTimes(count);
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(3);
});

it('uses transparent direct GPU output at CSS size times DPR without a final2D copy', async () => {
  type Input = {
    media: HTMLVideoElement;
    size: { width: number; height: number };
    appearance: CameraAppearance;
    signal: AbortSignal;
    acquire: GpuPreviewTargetFactory;
  };
  const backend = {
    allocatedBytes: 0,
    render: vi.fn(),
    dispose: vi.fn(),
    createSurface: vi.fn((canvas: HTMLCanvasElement) => ({
      canvas,
      present: vi.fn(async () => {}),
      dispose: vi.fn(),
    })),
  };
  const renderGpu = vi.fn(async (input: Input) => input.acquire(input.size, backend));
  gpu.create.mockReturnValue({ render: renderGpu, dispose: vi.fn() });
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await act(async () => {});
  expect(renderGpu).toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();
  const active = container.querySelector<HTMLCanvasElement>('[data-preview-inspector-canvas]')!;
  expect(active).not.toBe(container.querySelector('canvas'));
  expect(active.width).toBe(200);
  expect(active.height).toBe(150);
  expect(active.style.backgroundColor).toBe('transparent');
  expect(getComputedStyle(active).pointerEvents).toBe('none');
  expect(container.querySelector('[data-preview-stage-canvas]')).toBeNull();
});

type CropGpuInput = Parameters<
  ReturnType<
    typeof import('../../../../../features/video/composition/canvas/camera-crop-gpu').createCameraCropGpuRenderer
  >['render']
>[0];
function pendingGpu() {
  const calls: {
    input: CropGpuInput;
    resolve: (
      output:
        | import('../../../../../features/video/composition/canvas/preview-presentation').GpuPreviewOutput
        | false
        | undefined
    ) => void;
    reject: (error: Error) => void;
  }[] = [];
  const renderer = {
    allocatedBytes: 0,
    render: vi.fn(),
    dispose: vi.fn(),
    createSurface: vi.fn((canvas: HTMLCanvasElement) => ({
      canvas,
      present: vi.fn(async () => {}),
      dispose: vi.fn(),
    })),
  };
  const adapter = {
    dispose: vi.fn(),
    render: vi.fn(
      (input: CropGpuInput) =>
        new Promise<
          | import('../../../../../features/video/composition/canvas/preview-presentation').GpuPreviewOutput
          | false
          | undefined
        >((resolve, reject) => calls.push({ input, resolve, reject }))
    ),
  };
  gpu.create.mockReturnValue(adapter);
  const output = (index: number) => {
    const target = calls[index]!.input.acquire(calls[index]!.input.size, renderer);
    return { canvas: target.canvas, release: vi.fn(() => target.release()) };
  };
  return { calls, adapter, output };
}
const flush = () => act(async () => {});
it('coalesces crop drafts behind one active source capture and releases the superseded output', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  const old = g.output(0);
  act(() => root.render(<CameraCropPreview {...p} appearance={{ ...p.appearance, zoom: 3 }} />));
  act(() => root.render(<CameraCropPreview {...p} appearance={{ ...p.appearance, zoom: 4 }} />));
  expect(g.calls).toHaveLength(1);
  expect(g.calls[0]!.input.signal.aborted).toBe(true);
  await act(async () => g.calls[0]!.resolve(old));
  expect(old.release).toHaveBeenCalledTimes(1);
  expect(g.calls).toHaveLength(2);
  expect(g.calls[1]!.input.appearance.zoom).toBe(4);
  const next = g.output(1);
  await act(async () => g.calls[1]!.resolve(next));
  expect(draw).not.toHaveBeenCalled();
  expect(next.release).not.toHaveBeenCalled();
});
it('waits for a matching ready seek and preserves the old front across source supersession', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  const media = ready();
  await flush();
  const first = g.output(0);
  await act(async () => g.calls[0]!.resolve(first));
  act(() => root.render(<CameraCropPreview {...p} sourceTime={2} />));
  await flush();
  expect(button().disabled).toBe(true);
  expect(g.calls).toHaveLength(1);
  expect(first.release).not.toHaveBeenCalled();
  act(() => media.dispatchEvent(new Event('seeked')));
  await flush();
  expect(g.calls).toHaveLength(2);
  expect(g.calls[1]!.input.media.currentTime).toBe(2);
  const stale = g.output(1);
  Object.defineProperty(media, 'readyState', { value: 0, configurable: true });
  act(() => root.render(<CameraCropPreview {...p} sourceTime={3} url="blob:replacement" />));
  await flush();
  expect(g.calls[1]!.input.signal.aborted).toBe(true);
  expect(button().disabled).toBe(true);
  await act(async () => g.calls[1]!.resolve(stale));
  expect(stale.release).toHaveBeenCalledTimes(1);
  expect(g.calls).toHaveLength(2);
  expect(first.release).not.toHaveBeenCalled();
  ready();
  await flush();
  expect(g.calls).toHaveLength(3);
  expect(g.calls[2]!.input.media.currentTime).toBe(3);
  await act(async () => g.calls[2]!.resolve(false));
});
it('releases a late cancelled GPU result after unmount', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  const late = g.output(0);
  act(() => root.render(null));
  expect(g.calls[0]!.input.signal.aborted).toBe(true);
  expect(late.release).not.toHaveBeenCalled();
  await act(async () => g.calls[0]!.resolve(late));
  expect(late.release).toHaveBeenCalledTimes(1);
  expect(late.canvas.isConnected).toBe(false);
});
it('retains a valid front for an unready result and uses2D only for explicit GPU fallback', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  const first = g.output(0);
  await act(async () => g.calls[0]!.resolve(first));
  act(() => window.dispatchEvent(new Event('resize')));
  await flush();
  await act(async () => g.calls[1]!.resolve(false));
  expect(first.release).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event('resize')));
  await flush();
  await act(async () => g.calls[2]!.resolve(undefined));
  expect(draw).toHaveBeenCalledTimes(1);
  expect(first.release).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-preview-inspector-canvas]')).toBe(
    container.querySelector('canvas')
  );
});
it('reports ordinary GPU errors and retries instead of silently switching to2D', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  await act(async () => g.calls[0]!.reject(new Error('invalid scene')));
  expect(draw).not.toHaveBeenCalled();
  expect(button().disabled).toBe(true);
  act(() => container.querySelectorAll('button')[1]!.click());
  ready();
  await flush();
  expect(g.adapter.dispose).toHaveBeenCalledTimes(1);
  expect(g.calls).toHaveLength(2);
  await act(async () => g.calls[1]!.resolve(undefined));
  expect(draw).toHaveBeenCalledTimes(1);
  expect(button().disabled).toBe(false);
});
it.each(['rounded', 'soft', 'ellipse', 'circle'] as const)(
  'keeps %s camera controls on the directGPU path',
  async (shape) => {
    const p = { ...props(), appearance: { ...DEFAULT_CAMERA_APPEARANCE, shape, zoom: 2 } };
    const backend = {
      allocatedBytes: 0,
      render: vi.fn(),
      dispose: vi.fn(),
      createSurface: vi.fn((canvas: HTMLCanvasElement) => ({
        canvas,
        present: vi.fn(async () => {}),
        dispose: vi.fn(),
      })),
    };
    const renderGpu = vi.fn(async (input: CropGpuInput) => input.acquire(input.size, backend));
    gpu.create.mockReturnValue({ render: renderGpu, dispose: vi.fn() });
    act(() => root.render(<CameraCropPreview {...p} />));
    ready();
    await flush();
    expect(renderGpu.mock.calls[0]![0].appearance.shape).toBe(shape);
    expect(draw).not.toHaveBeenCalled();
    act(() =>
      button().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
    );
    expect(p.onChange).toHaveBeenCalledExactlyOnceWith({ ...p.appearance, panX: 0.1 });
  }
);

it('uses explicitLegacy preference without reloading its camera or invoking GPU again', async () => {
  const g = pendingGpu(),
    p = props();
  const show = (renderer: 'gpu' | 'legacy') =>
    act(() =>
      root.render(
        <WorkspacePreviewContext.Provider
          value={{
            sourceViewerActive: false,
            setSourceViewerActive: vi.fn(),
            resetPaneHeight: vi.fn(),
            handleVerticalResizeKeyDown: vi.fn(),
            handleStartVerticalResize: vi.fn(),
            paneHeight: null,
            workspaceSplitRef: { current: null },
            preferences: {
              preferences: { ...DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES, renderer },
              retrySave: vi.fn(),
              saveFailed: false,
              updatePreferences: vi.fn(),
            },
          }}
        >
          <CameraCropPreview {...p} />
        </WorkspacePreviewContext.Provider>
      )
    );
  show('gpu');
  const video = ready();
  await flush();
  const first = g.output(0);
  await act(async () => g.calls[0]!.resolve(first));
  const loads = load.mock.calls.length;
  show('legacy');
  await flush();
  expect(g.calls).toHaveLength(1);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(first.release).toHaveBeenCalledTimes(1);
  expect(g.adapter.dispose).toHaveBeenCalledTimes(1);
  expect(container.querySelector('video')).toBe(video);
  expect(load).toHaveBeenCalledTimes(loads);
});
it('samples the current CSS box times DPR at queued admission', async () => {
  const g = pendingGpu(),
    p = props(),
    dpr = window.devicePixelRatio;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  try {
    act(() => root.render(<CameraCropPreview {...p} />));
    ready();
    await flush();
    expect(g.calls[0]!.input.size).toEqual({ width: 400, height: 300 });
    await act(async () => g.calls[0]!.resolve(false));
  } finally {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: dpr });
  }
});

it('rejects a pending GPU result resolved from the newer visual commit layout phase', async () => {
  const g = pendingGpu(),
    p = props(),
    published: HTMLCanvasElement[] = [];
  const create = presentation.createPreviewPresentationSession;
  vi.spyOn(presentation, 'createPreviewPresentationSession').mockImplementation((options) => {
    const owner = create(options),
      publish = owner.publish;
    vi.spyOn(owner, 'publish').mockImplementation((output, geometry) => {
      if (output) published.push(output.canvas);
      publish(output, geometry);
    });
    return owner;
  });
  let stale: ReturnType<typeof g.output> | undefined;
  function Probe({ zoom }: { zoom: number }) {
    useLayoutEffect(() => {
      if (zoom === 3 && stale) g.calls[0]!.resolve(stale);
    }, [zoom]);
    return <CameraCropPreview {...p} appearance={{ ...p.appearance, zoom }} />;
  }
  act(() => root.render(<Probe zoom={2} />));
  ready();
  await flush();
  stale = g.output(0);
  await act(async () => root.render(<Probe zoom={3} />));
  expect(stale.release).toHaveBeenCalledTimes(1);
  expect(published).not.toContain(stale.canvas);
  expect(g.calls[0]!.input.signal.aborted).toBe(true);
  expect(g.calls[1]!.input.appearance.zoom).toBe(3);
  await act(async () => g.calls[1]!.resolve(false));
});

it('keeps the pending GPU capture for semantic appearance clones and observes only once', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  const count = g.calls.length,
    current = g.calls.at(-1)!;
  act(() => root.render(<CameraCropPreview {...p} appearance={{ ...p.appearance }} />));
  await flush();
  expect(current.input.signal.aborted).toBe(false);
  expect(g.calls).toHaveLength(count);
  expect(observe).toHaveBeenCalledTimes(1);
  await act(async () => current.resolve(false));
  expect(g.calls).toHaveLength(count);
});
it('keeps one resize observer across visual changes while a genuine resize still captures', async () => {
  const g = pendingGpu(),
    p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  act(() => root.render(<CameraCropPreview {...p} mirrored />));
  await flush();
  await act(async () => g.calls[0]!.resolve(false));
  expect(observe).toHaveBeenCalledTimes(1);
  expect(g.calls.at(-1)!.input.mirrored).toBe(true);
  await act(async () => g.calls.at(-1)!.resolve(false));
  const before = g.calls.length;
  vi.spyOn(container.querySelector('canvas')!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 150)
  );
  act(() => observations.find((entry) => !entry.disconnected)!.notify());
  await flush();
  expect(g.calls).toHaveLength(before + 1);
  expect(g.calls.at(-1)!.input.size.width).toBe(300);
  await act(async () => g.calls.at(-1)!.resolve(false));
});

it('borrows the mapped canonical image through GPU completion', async () => {
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  const p = { ...props(), rangeStart: 0.1, rangeEnd: 0.5, endpoint: 'retained-end' as const };
  const source = {
    sourceWidth: 800,
    sourceHeight: 400,
    orientation: { rotation: 90, flip: true },
    draw: vi.fn(),
    toVideoFrame: vi.fn(),
  };
  const release = vi.fn();
  sources.acquire.mockResolvedValue({
    bindings: new Map([
      ['camera-crop', { source, target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: p.url }],
    ]),
    release,
  });
  const f = pendingGpu();
  act(() => root.render(<CameraCropPreview {...p} />));
  const media = ready();
  media.currentTime = 0.6;
  await flush();
  expect(sources.acquire).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        id: 'camera-crop',
        url: p.url,
        time: 0.5,
        rangeStart: 0.1,
        rangeEnd: 0.5,
        endpoint: 'retained-end',
      }),
    ],
    expect.any(AbortSignal),
    { discontinuity: true }
  );
  expect(sources.acquire.mock.calls[0]![0][0]).not.toHaveProperty('holdEnd');
  expect(f.calls[0]!.input).toEqual(expect.objectContaining({ source }));
  expect(release).not.toHaveBeenCalled();
  const output = f.output(0);
  await act(async () => f.calls[0]!.resolve(output));
  expect(release).toHaveBeenCalledOnce();
  expect(draw).not.toHaveBeenCalled();
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 75);
  pointer('pointerup', 120, 75);
  expect(p.onChange).toHaveBeenCalledWith(expect.objectContaining({ panX: -0.1 }));
});

function canonicalLease() {
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  const source = { sourceWidth: 800, sourceHeight: 400, draw: vi.fn(), toVideoFrame: vi.fn() };
  const release = vi.fn();
  const lease = {
    bindings: new Map([
      [
        'camera-crop',
        { source, target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:camera' },
      ],
    ]),
    release,
  };
  return { source, release, lease };
}

it.each(['cancel', 'time', 'source', 'unmount', 'reject'] as const)(
  'retains the canonical lease until GPU settlement after %s',
  async (mode) => {
    const p = props();
    const source = canonicalLease();
    sources.acquire.mockResolvedValueOnce(source.lease).mockReturnValue(new Promise(() => {}));
    const f = pendingGpu();
    act(() => root.render(<CameraCropPreview {...p} />));
    ready();
    await flush();
    expect(f.calls).toHaveLength(1);
    const late = f.output(0);
    if (mode === 'time') act(() => root.render(<CameraCropPreview {...p} sourceTime={1} />));
    if (mode === 'source') act(() => root.render(<CameraCropPreview {...p} url="blob:new" />));
    if (mode === 'cancel')
      act(() => container.querySelector('video')!.dispatchEvent(new Event('error')));
    if (mode === 'unmount') act(() => root.render(null));
    expect(source.release).not.toHaveBeenCalled();
    await act(async () => {
      if (mode === 'reject') f.calls[0]!.reject(new Error('invalid source'));
      else f.calls[0]!.resolve(late);
    });
    expect(source.release).toHaveBeenCalledOnce();
    expect(
      container.querySelector(
        '[data-ui="video-editor.camera-crop.gpu-host"] [data-preview-inspector-canvas]'
      )
    ).toBeNull();
    if (mode !== 'reject') expect(late.release).toHaveBeenCalledOnce();
  }
);

it('releases a late acquisition after source replacement without rendering it', async () => {
  const p = props();
  const source = canonicalLease();
  const gate = Promise.withResolvers<typeof source.lease>();
  sources.acquire.mockReturnValueOnce(gate.promise).mockReturnValue(new Promise(() => {}));
  const f = pendingGpu();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  act(() => root.render(<CameraCropPreview {...p} url="blob:new" />));
  await act(async () => gate.resolve(source.lease));
  expect(source.release).toHaveBeenCalledOnce();
  expect(f.calls).toHaveLength(0);
  expect(draw).not.toHaveBeenCalled();
});

it.each(['unsupported', 'decode-failure'] as const)(
  'uses HTML compatibility only for actual unsupported acquisition: %s',
  async (mode) => {
    const p = props();
    canonicalLease();
    if (mode === 'decode-failure')
      sources.acquire.mockRejectedValueOnce(new Error('decode failed'));
    const f = pendingGpu();
    act(() => root.render(<CameraCropPreview {...p} />));
    ready();
    await flush();
    if (mode === 'decode-failure') {
      expect(f.calls).toHaveLength(0);
      expect(draw).not.toHaveBeenCalled();
      expect(button().disabled).toBe(true);
      expect(container.textContent).toContain(translate('common.actions.retry'));
    } else {
      expect(f.calls[0]!.input).not.toHaveProperty('source');
      await act(async () => f.calls[0]!.resolve(undefined));
      expect(draw).toHaveBeenCalled();
      expect(button().disabled).toBe(false);
    }
  }
);

it.each(['fallback', 'legacy', 'draw-failure'] as const)(
  'normalizes the same canonical image for Canvas %s',
  async (mode) => {
    class Frame {
      format = 'RGBA';
      codedWidth = 400;
      codedHeight = 800;
      displayWidth = 400;
      displayHeight = 800;
      timestamp = 300000;
      duration = 100000;
      visibleRect = { x: 0, y: 0, width: 400, height: 800 };
      colorSpace = { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false };
      close = vi.fn();
    }
    const p = props();
    const owned = canonicalLease();
    vi.stubGlobal('VideoFrame', Frame);
    const frame = new Frame();
    const source = {
      ...owned.source,
      orientation: { rotation: 90 as const, flip: true },
      toVideoFrame: () => frame as unknown as VideoFrame,
    };
    sources.acquire.mockResolvedValue({
      ...owned.lease,
      bindings: new Map([['camera-crop', { ...owned.lease.bindings.get('camera-crop')!, source }]]),
    });
    const normalize = normalization.prepareDecodedVideoSample;
    const sampleDraw = vi.fn();
    const sampleClose = vi.fn();
    vi.spyOn(normalization, 'prepareDecodedVideoSample').mockImplementation(
      async (sample, signal) => {
        expect(sample.timestamp).toBe(0.3);
        expect(sample.rotation).toBe(90);
        expect(sample.flip).toBe(true);
        expect(sample.colorSpace).toMatchObject(frame.colorSpace);
        const safe = await normalize(sample, signal);
        vi.spyOn(safe, 'draw').mockImplementation(sampleDraw);
        const close = safe.close.bind(safe);
        vi.spyOn(safe, 'close').mockImplementation(() => {
          sampleClose();
          close();
        });
        return safe;
      }
    );
    if (mode === 'draw-failure')
      sampleDraw.mockImplementation(() => {
        throw new Error('draw failed');
      });
    act(() =>
      root.render(
        <WorkspacePreviewContext.Provider
          value={{
            sourceViewerActive: false,
            setSourceViewerActive: vi.fn(),
            resetPaneHeight: vi.fn(),
            handleVerticalResizeKeyDown: vi.fn(),
            handleStartVerticalResize: vi.fn(),
            paneHeight: null,
            workspaceSplitRef: { current: null },
            preferences: {
              preferences: {
                ...DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
                renderer: mode === 'legacy' ? 'legacy' : 'gpu',
              },
              retrySave: vi.fn(),
              saveFailed: false,
              updatePreferences: vi.fn(),
            },
          }}
        >
          <CameraCropPreview {...p} />
        </WorkspacePreviewContext.Provider>
      )
    );
    ready();
    await flush();
    expect(normalization.prepareDecodedVideoSample).toHaveBeenCalledOnce();
    expect(sampleDraw).toHaveBeenCalledOnce();
    expect(sampleClose).toHaveBeenCalledOnce();
    expect(owned.release).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    if (mode === 'legacy') expect(gpu.create).not.toHaveBeenCalled();
    expect(button().disabled).toBe(mode === 'draw-failure');
  }
);

it('holds editing until the same-time retained endpoint image is accepted', async () => {
  const p = { ...props(), rangeStart: 0, rangeEnd: 1 };
  const old = canonicalLease();
  const source = { ...old.source, sourceWidth: 400, sourceHeight: 800 };
  const release = vi.fn();
  sources.acquire.mockResolvedValueOnce(old.lease).mockResolvedValueOnce({
    bindings: new Map([
      [
        'camera-crop',
        {
          source,
          target: 0.5,
          timestamp: 0.4,
          nextTimestamp: 0.5,
          heldAtRetainedEnd: true,
          url: p.url,
        },
      ],
    ]),
    release,
  });
  const f = pendingGpu();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  const previous = f.output(0);
  await act(async () => f.calls[0]!.resolve(previous));
  expect(button().disabled).toBe(false);
  act(() => root.render(<CameraCropPreview {...p} rangeEnd={0.5} endpoint="retained-end" />));
  await flush();
  expect(f.calls).toHaveLength(2);
  expect(f.calls[1]!.input.source).toBe(source);
  expect(button().disabled).toBe(true);
  expect(previous.release).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ui="video-editor.camera-crop.gpu-host"] canvas')).toBe(
    previous.canvas
  );
  const next = f.output(1);
  await act(async () => f.calls[1]!.resolve(next));
  expect(button().disabled).toBe(false);
  expect(previous.release).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 75);
  pointer('pointerup', 120, 75);
  expect(p.onChange).toHaveBeenCalledWith(expect.objectContaining({ panX: -0.2 }));
});

it('holds changed retained starts while appearance drafts remain editable', async () => {
  const p = { ...props(), rangeStart: 0, rangeEnd: 1 };
  const owned = canonicalLease();
  sources.acquire.mockResolvedValue(owned.lease);
  const f = pendingGpu();
  act(() => root.render(<CameraCropPreview {...p} />));
  ready();
  await flush();
  await act(async () => f.calls[0]!.resolve(f.output(0)));
  act(() => root.render(<CameraCropPreview {...p} rangeStart={0.1} />));
  await flush();
  expect(button().disabled).toBe(true);
  await act(async () => f.calls[1]!.resolve(f.output(1)));
  expect(button().disabled).toBe(false);
  act(() =>
    root.render(
      <CameraCropPreview {...p} rangeStart={0.1} appearance={{ ...p.appearance, zoom: 3 }} />
    )
  );
  await flush();
  expect(f.calls).toHaveLength(3);
  expect(button().disabled).toBe(false);
  await act(async () => f.calls[2]!.resolve(f.output(2)));
});

it.each([11, 13])('keeps a bounded camera request at %s across physical EOF', async (time) => {
  const canonical = await vi.importActual<
    typeof import('../../../../../workflows/video/preview-source')
  >('../../../../../workflows/video/preview-source');
  const loans: VideoSample[] = [];
  const provider = canonical.createPreviewSourceProvider({
    open: async () => ({
      end: 12,
      dispose: vi.fn(),
      async *samples(start) {
        const timestamps = [10, 11.4, 11.9];
        const first = Math.max(
          0,
          timestamps.findLastIndex((timestamp) => timestamp <= start)
        );
        for (const timestamp of timestamps.slice(first)) {
          const sample = new VideoSample(new Uint8Array(16), {
            format: 'RGBA',
            codedWidth: 2,
            codedHeight: 2,
            timestamp,
            duration: 0.001,
          });
          const clone = sample.clone.bind(sample);
          vi.spyOn(sample, 'clone').mockImplementation(() => {
            const loan = clone();
            vi.spyOn(loan, 'close');
            loans.push(loan);
            return loan;
          });
          yield sample;
        }
      },
    }),
  });
  const acquire = vi.spyOn(provider, 'acquire');
  sources.create.mockReturnValue(provider);
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  const p = { ...props(), sourceTime: time, rangeStart: 2, rangeEnd: 14 };
  const f = pendingGpu();
  act(() => root.render(<CameraCropPreview {...p} />));
  const media = ready();
  media.currentTime = Math.min(time, 11.999);
  await flush();
  expect(f.calls).toHaveLength(1);
  const lease = await acquire.mock.results[0]!.value;
  const binding = lease?.bindings.get('camera-crop');
  expect(binding).toMatchObject({
    target: time,
    timestamp: time < 12 ? 10 : 11.9,
    nextTimestamp: time < 12 ? 11.4 : 12,
  });
  expect(binding?.source).toBe(f.calls[0]!.input.source);
  if (time < 12) expect(binding).not.toHaveProperty('heldAtEnd');
  else expect(binding).toHaveProperty('heldAtEnd', true);
  expect(binding).not.toHaveProperty('heldAtRetainedEnd');
  expect(loans).toHaveLength(1);
  expect(loans[0]!.close).not.toHaveBeenCalled();
  await act(async () => f.calls[0]!.resolve(f.output(0)));
  expect(loans[0]!.close).toHaveBeenCalledOnce();
  expect(button().disabled).toBe(false);
  expect(acquire).toHaveBeenCalledWith(
    [expect.objectContaining({ time, rangeStart: 2, rangeEnd: 14, holdEnd: true })],
    expect.any(AbortSignal),
    { discontinuity: true }
  );
});
