// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewWebcamCropPreview } from './webcam-crop-preview';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { drawReviewWebcam } from '../../workflows/video-review/render-webcam';
import { ReviewPreviewRendererContext } from './use-preview-preferences';
import type { createCameraCropGpuRenderer } from '../../features/video/composition/canvas/camera-crop-gpu';
import type { GpuPreviewRenderer } from '../../features/video/composition/canvas/gpu-preview';
import type { GpuPreviewOutput } from '../../features/video/composition/canvas/preview-presentation';

const gpu = vi.hoisted(() => ({
  render: vi.fn<ReturnType<typeof createCameraCropGpuRenderer>['render']>(async () => undefined),
  dispose: vi.fn(),
}));
vi.mock('../../features/video/composition/canvas/camera-crop-gpu', () => ({
  createCameraCropGpuRenderer: () => gpu,
}));

vi.mock('../../workflows/video-review/asset-bytes', () => ({ resolveReviewAssetBytes: vi.fn() }));
vi.mock('../../workflows/video-review/render-webcam', () => ({ drawReviewWebcam: vi.fn() }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  gpu.render.mockReset().mockResolvedValue(undefined);
});

it('loads once, previews crop gestures, commits once and releases resources on close', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const create = vi.fn(() => 'blob:crop'),
    revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  vi.mocked(resolveReviewAssetBytes).mockResolvedValue(new Blob(['camera']));
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const camera = createQuickEditWebcam(
    'project-asset:c',
    { width: 100, height: 100 },
    { width: 100, height: 100 }
  );
  let props = {
    camera,
    crop: { zoom: 2, panX: 0, panY: 0 },
    time: 2,
    width: 100,
    height: 100,
    onChange: vi.fn(),
  };
  const render = async () => act(async () => root.render(<ReviewWebcamCropPreview {...props} />));
  const pointer = (node: Element, type: string, x: number) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: x });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      node.dispatchEvent(event);
    });
  try {
    await render();
    const video = host.querySelector('video')!,
      button = host.querySelector('button')!;
    Object.defineProperties(video, {
      duration: { value: 10 },
      readyState: { value: 2 },
      videoWidth: { value: 100, configurable: true },
      videoHeight: { value: 100, configurable: true },
    });
    Object.assign(button, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    await act(async () => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('loadeddata'));
    });
    expect(video.currentTime).toBe(2);
    expect(button.disabled).toBe(false);
    expect(gpu.render).toHaveBeenCalled();
    pointer(button, 'pointerdown', 50);
    pointer(button, 'pointermove', 60);
    expect(props.onChange).not.toHaveBeenCalled();
    pointer(button, 'pointerup', 60);
    expect(props.onChange).toHaveBeenLastCalledWith({ zoom: 2, panX: -0.2, panY: -0.2 });
    props.onChange.mockClear();
    pointer(button, 'pointerdown', 50);
    pointer(button, 'pointermove', 70);
    act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    pointer(button, 'pointerup', 70);
    expect(props.onChange).not.toHaveBeenCalled();
    props = { ...props, camera: { ...camera, mirrored: true }, time: 4 };
    await render();
    expect(video.currentTime).toBe(4);
    expect(button.disabled).toBe(true);
    await act(async () => video.dispatchEvent(new Event('seeked')));
    expect(button.disabled).toBe(false);
    expect(create).toHaveBeenCalledOnce();
    act(() =>
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    );
    expect(props.onChange).toHaveBeenLastCalledWith({ zoom: 2, panX: -0.1, panY: 0 });
    pointer(button, 'pointerdown', 50);
    pointer(button, 'pointermove', 60);
    pointer(button, 'pointerup', 60);
    expect(props.onChange).toHaveBeenLastCalledWith({ zoom: 2, panX: 0.2, panY: -0.2 });
    expect(drawReviewWebcam).toHaveBeenCalled();
    Object.defineProperties(video, { videoWidth: { value: 640 }, videoHeight: { value: 480 } });
    props = {
      ...props,
      camera: { ...camera, appearance: { ...camera.appearance, shape: 'circle' } },
      crop: { zoom: 1, panX: 0, panY: 0 },
    };
    await render();
    expect(button.style.aspectRatio).toBe('100 / 100');
    props.onChange.mockClear();
    pointer(button, 'pointerdown', 50);
    pointer(button, 'pointermove', 60);
    pointer(button, 'pointerup', 60);
    expect(props.onChange).toHaveBeenCalledOnce();
    expect(props.onChange.mock.lastCall?.[0]).toMatchObject({ zoom: 1, panY: 0 });
    expect(props.onChange.mock.lastCall?.[0].panX).toBeCloseTo(-0.6, 8);
    act(() => video.dispatchEvent(new Event('error')));
    expect(host.textContent).toContain('videoEditor.sidebar.framingPreviewFailed');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.retry"]')!.click()
    );
    expect(revoke).toHaveBeenCalledWith('blob:crop');
    expect(create).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
  expect(revoke).toHaveBeenCalledTimes(2);
});

async function mountedCrop(renderer: 'gpu' | 'legacy' = 'gpu') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const create = vi.fn(() => 'blob:crop'),
    revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  vi.mocked(resolveReviewAssetBytes).mockResolvedValue(new Blob(['camera']));
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  );
  const backend = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>((canvas) => ({
      canvas,
      present: vi.fn(async () => {}),
      releaseImage: vi.fn(),
      dispose: vi.fn(),
    })),
  } satisfies GpuPreviewRenderer;
  const jobs: {
    output: GpuPreviewOutput;
    complete(): void;
    signal: AbortSignal;
    release: ReturnType<typeof vi.fn>;
  }[] = [];
  gpu.render.mockImplementation((input) => {
    const target = input.acquire(input.size, backend);
    const release = vi.fn(() => target.release());
    const output = { canvas: target.canvas, release };
    return new Promise((resolve) =>
      jobs.push({
        output,
        release,
        signal: input.signal,
        complete: () => resolve(output),
      })
    );
  });
  const host = document.createElement('div'),
    root = createRoot(host);
  const camera = createQuickEditWebcam(
    'project-asset:c',
    { width: 100, height: 100 },
    { width: 100, height: 100 }
  );
  let props = {
    camera,
    crop: { zoom: 2, panX: 0, panY: 0 },
    time: 2,
    width: 100,
    height: 100,
    onChange: vi.fn(),
  };
  const render = () =>
    act(async () =>
      root.render(
        <ReviewPreviewRendererContext.Provider value={renderer}>
          <ReviewWebcamCropPreview {...props} />
        </ReviewPreviewRendererContext.Provider>
      )
    );
  await render();
  const video = host.querySelector('video')!,
    button = host.querySelector('button')!,
    fallback = host.querySelector('canvas')!;
  Object.defineProperties(video, {
    duration: { value: 10, configurable: true },
    readyState: { value: 2 },
    videoWidth: { value: 100 },
    videoHeight: { value: 100 },
  });
  const loaded = () =>
    act(async () => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('loadeddata'));
    });
  const update = async (change: Partial<typeof props>) => {
    props = { ...props, ...change };
    await render();
  };
  let mounted = true;
  const unmount = () => {
    if (mounted) {
      mounted = false;
      act(() => root.unmount());
    }
  };
  return {
    host,
    video,
    button,
    fallback,
    jobs,
    loaded,
    update,
    camera,
    create,
    revoke,
    context,
    unmount,
  };
}

it('publishes completed GPU destinations in one mounted presenter without Canvas fallback', async () => {
  const f = await mountedCrop();
  try {
    await f.loaded();
    expect(f.jobs).toHaveLength(1);
    const first = f.jobs[0]!;
    expect(first.output.canvas.style.opacity).toBe('0');
    expect(f.fallback.style.opacity).toBe('1');
    await act(async () => first.complete());
    expect(first.output.canvas.parentElement).toBe(
      f.host.querySelector('[data-ui="gallery.videoReview.webcamCrop.gpuHost"]')
    );
    expect(first.output.canvas.style.opacity).toBe('1');
    expect(first.output.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
    expect(f.fallback.style.opacity).toBe('0');
    await f.update({ crop: { zoom: 3, panX: 0.2, panY: 0 } });
    expect(first.release).not.toHaveBeenCalled();
    expect(first.output.canvas.style.opacity).toBe('1');
    const next = f.jobs[1]!;
    expect(next.output.canvas.style.opacity).toBe('0');
    await act(async () => next.complete());
    expect(first.release).toHaveBeenCalledOnce();
    expect(first.output.canvas.style.opacity).toBe('0');
    expect(next.output.canvas.style.opacity).toBe('1');
    expect(f.context).not.toHaveBeenCalled();
    expect(drawReviewWebcam).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
    f.unmount();
    expect(next.release).toHaveBeenCalledOnce();
    expect(next.output.canvas.parentElement).toBeNull();
    expect(gpu.dispose).toHaveBeenCalledOnce();
  } finally {
    f.unmount();
  }
});

it.each(['seek', 'source replacement', 'unmount'] as const)(
  'does not publish a late completed GPU destination after %s',
  async (invalidation) => {
    const f = await mountedCrop();
    try {
      await f.loaded();
      const front = f.jobs[0]!;
      await act(async () => front.complete());
      await f.update({ crop: { zoom: 3, panX: 0, panY: 0 } });
      const stale = f.jobs[1]!;
      if (invalidation === 'seek') {
        await f.update({ time: 4 });
        expect(f.video.currentTime).toBe(4);
        expect(f.button.disabled).toBe(true);
      } else if (invalidation === 'source replacement') {
        await f.update({ camera: { ...f.camera, assetId: 'project-asset:replacement' } });
        expect(f.button.disabled).toBe(true);
        expect(f.create).toHaveBeenCalledTimes(2);
      } else f.unmount();
      expect(stale.signal.aborted).toBe(true);
      await act(async () => stale.complete());
      expect(stale.release).toHaveBeenCalledOnce();
      expect(stale.output.canvas.style.opacity).toBe('0');
      expect(stale.output.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(false);
      expect(drawReviewWebcam).not.toHaveBeenCalled();
      if (invalidation !== 'unmount') {
        expect(front.output.canvas.style.opacity).toBe('1');
        expect(front.release).not.toHaveBeenCalled();
        await act(async () => f.video.dispatchEvent(new Event('seeked')));
        expect(f.button.disabled).toBe(false);
      } else expect(stale.output.canvas.parentElement).toBeNull();
    } finally {
      f.unmount();
    }
  }
);

it('uses the selected legacy renderer without reloading media for crop or clock changes', async () => {
  const f = await mountedCrop('legacy');
  try {
    await f.loaded();
    expect(drawReviewWebcam).toHaveBeenCalledOnce();
    expect(f.fallback.style.opacity).toBe('1');
    expect(f.context).toHaveBeenCalledWith('2d');
    await f.update({ crop: { zoom: 3, panX: 0.1, panY: 0 } });
    expect(drawReviewWebcam).toHaveBeenCalledTimes(2);
    await f.update({ time: 4 });
    expect(f.button.disabled).toBe(true);
    expect(drawReviewWebcam).toHaveBeenCalledTimes(2);
    await act(async () => f.video.dispatchEvent(new Event('seeked')));
    expect(f.button.disabled).toBe(false);
    expect(drawReviewWebcam).toHaveBeenCalledTimes(3);
    expect(gpu.render).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
    expect(resolveReviewAssetBytes).toHaveBeenCalledOnce();
  } finally {
    f.unmount();
  }
});

it('seeks durationless WebM and publishes GPU pixels only after seeked recovery', async () => {
  const f = await mountedCrop();
  try {
    Object.defineProperty(f.video, 'duration', { value: Infinity });
    await f.loaded();
    expect(f.video.currentTime).toBe(2);
    const first = f.jobs[0]!;
    await act(async () => first.complete());
    await f.update({ time: 4 });
    expect(f.video.currentTime).toBe(4);
    expect(f.button.disabled).toBe(true);
    expect(f.jobs).toHaveLength(1);
    expect(first.output.canvas.style.opacity).toBe('1');
    await act(async () => f.video.dispatchEvent(new Event('seeked')));
    expect(f.button.disabled).toBe(false);
    expect(f.jobs).toHaveLength(2);
    const recovered = f.jobs[1]!;
    await act(async () => recovered.complete());
    expect(recovered.output.canvas.style.opacity).toBe('1');
    expect(first.release).toHaveBeenCalledOnce();
    expect(drawReviewWebcam).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
  } finally {
    f.unmount();
  }
});

it('retains ready endpoint pixels when successive requested times clamp to the same frame', async () => {
  const f = await mountedCrop();
  try {
    await f.loaded();
    await act(async () => f.jobs[0]!.complete());
    await f.update({ time: 11 });
    expect(f.video.currentTime).toBe(9.999);
    expect(f.button.disabled).toBe(true);
    await act(async () => f.video.dispatchEvent(new Event('seeked')));
    expect(f.button.disabled).toBe(false);
    const endpoint = f.jobs[1]!;
    await act(async () => endpoint.complete());
    await f.update({ time: 12 });
    expect(f.video.currentTime).toBe(9.999);
    expect(f.button.disabled).toBe(false);
    expect(endpoint.output.canvas.style.opacity).toBe('1');
    expect(endpoint.output.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
    expect(endpoint.release).not.toHaveBeenCalled();
    expect(drawReviewWebcam).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
  } finally {
    f.unmount();
  }
});
