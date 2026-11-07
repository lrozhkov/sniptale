import type { GpuPreviewTargetFactory } from '../../../../../features/video/composition/canvas/preview-presentation';
import * as presentation from '../../../../../features/video/composition/canvas/preview-presentation';
import { WorkspacePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES } from '../../../../../composition/persistence/video-editor-preview-preferences/model';

import type { CameraAppearance } from '../../../../../features/video/project/camera/appearance';
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
