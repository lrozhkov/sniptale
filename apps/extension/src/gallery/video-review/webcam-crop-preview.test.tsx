// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewWebcamCropPreview } from './webcam-crop-preview';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { drawReviewWebcam } from '../../workflows/video-review/render-webcam';

vi.mock('../../workflows/video-review/asset-bytes', () => ({ resolveReviewAssetBytes: vi.fn() }));
vi.mock('../../workflows/video-review/render-webcam', () => ({ drawReviewWebcam: vi.fn() }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

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
