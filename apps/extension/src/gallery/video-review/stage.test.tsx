// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewStage } from './stage';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(450);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const source = { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 };

const renderStage = (zoom: {
  camera: QuickEditCameraTransform;
  background: QuickEditBackgroundSettings;
  onDrag: (point: { x: number; y: number }) => void;
}) => {
  act(() => {
    root.render(
      <ReviewStage
        url="blob:review"
        source={source}
        video={{ current: null }}
        drawing={false}
        region={undefined}
        zoom={zoom}
        onRegion={vi.fn()}
        onReady={vi.fn()}
        onTime={vi.fn()}
        onPlaying={vi.fn()}
        onError={vi.fn()}
      />
    );
  });
  return {
    target: host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomTarget"]')!,
    event: async (target: Element, kind: string, x: number, y: number) =>
      act(async () => {
        target.dispatchEvent(
          new MouseEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0 })
        );
      }),
  };
};

it('maps canvas target drags into normalized content points and restores on escape', async () => {
  const onDrag = vi.fn((_point: { x: number; y: number }) => undefined);
  const background: QuickEditBackgroundSettings = { enabled: false };
  const stage = renderStage({
    camera: { scale: 2, centerX: 0.3, centerY: 0.4 },
    background,
    onDrag,
  });
  const target = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomTarget"]')!;
  Object.assign(target, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const bounds = host.getBoundingClientRect();
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(bounds);
  // Drag inside the fitted video rect: the center moves toward the pointer.
  await stage.event(target, 'pointerdown', bounds.left + 300, bounds.top + 200);
  await stage.event(target, 'pointermove', bounds.left + 400, bounds.top + 180);
  expect(onDrag).toHaveBeenCalled();
  const dragged = onDrag.mock.lastCall?.[0] as { x: number; y: number };
  expect(dragged.x).toBeGreaterThanOrEqual(0);
  expect(dragged.x).toBeLessThanOrEqual(1);
  // Escape restores the drag origin without committing a new point.
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onDrag).toHaveBeenLastCalledWith({ x: 0.3, y: 0.4 });
  await stage.event(target, 'pointerup', bounds.left + 400, bounds.top + 180);
});

it('renders nothing interactive while the zoom selection is absent', async () => {
  act(() => {
    root.render(
      <ReviewStage
        url="blob:review"
        source={source}
        video={{ current: null }}
        drawing={false}
        region={undefined}
        onRegion={vi.fn()}
        onReady={vi.fn()}
        onTime={vi.fn()}
        onPlaying={vi.fn()}
        onError={vi.fn()}
      />
    );
  });
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomTarget"]')).toBeNull();
});
