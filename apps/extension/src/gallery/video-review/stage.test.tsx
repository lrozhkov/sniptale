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
const identity: QuickEditCameraTransform = { scale: 1, centerX: 0.5, centerY: 0.5 };
const disabled: QuickEditBackgroundSettings = { enabled: false };

const renderStage = (props: {
  scene?: { background: QuickEditBackgroundSettings; camera: QuickEditCameraTransform };
  zoom?: { camera: QuickEditCameraTransform; onDrag: (point: { x: number; y: number }) => void };
}) => {
  act(() => {
    root.render(
      <ReviewStage
        url="blob:review"
        source={source}
        video={{ current: null }}
        drawing={false}
        region={undefined}
        {...(props.scene ? { scene: props.scene } : {})}
        {...(props.zoom ? { zoom: props.zoom } : {})}
        onRegion={vi.fn()}
        onReady={vi.fn()}
        onTime={vi.fn()}
        onPlaying={vi.fn()}
        onError={vi.fn()}
      />
    );
  });
  return {
    video: host.querySelector('video')!,
    event: async (target: Element, kind: string, x: number, y: number) =>
      act(async () => {
        target.dispatchEvent(
          new MouseEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0 })
        );
      }),
  };
};

it('applies the scene camera transform to the video element (R05)', async () => {
  const stage = renderStage({
    scene: { background: disabled, camera: { scale: 2, centerX: 0.5, centerY: 0.5 } },
  });
  // Fitted rect for an 800x450 host and a 320x180 source fills the host; a 2x
  // camera scales the video around the focus and crops to the content rect.
  expect(stage.video.style.left).toBe('-400px');
  expect(stage.video.style.top).toBe('-225px');
  expect(stage.video.style.width).toBe('1600px');
  expect(stage.video.style.height).toBe('900px');
  expect(stage.video.style.maxWidth).toBe('none');
});

it('paints the scene background and crops the video to the content rect', async () => {
  const stage = renderStage({
    scene: {
      background: {
        enabled: true,
        type: 'solid',
        color: '#112233ff',
        layout: { padding: 40, cornerRadius: 12 },
      },
      camera: identity,
    },
  });
  const stageNode = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.stage"]')!;
  expect(stageNode.style.background).toBe('rgb(17, 34, 51)');
  const clip = stage.video.parentElement!;
  expect(clip.style.left).toBe('100px');
  expect(clip.style.top).toBe('100px');
  expect(clip.style.width).toBe('600px');
  expect(clip.style.height).toBe('250px');
  expect(clip.style.overflow).toBe('hidden');
  // Fitted video inside the padded content rect (letterboxed horizontally).
  const left = Number(stage.video.style.left.replace('px', ''));
  const width = Number(stage.video.style.width.replace('px', ''));
  expect(left).toBeCloseTo(77.78, 1);
  expect(Number(stage.video.style.top.replace('px', ''))).toBeCloseTo(0, 6);
  expect(width).toBeCloseTo(444.44, 1);
  expect(Number(stage.video.style.height.replace('px', ''))).toBeCloseTo(250, 6);
});

it('keeps the scene applied when the zoom selection is absent (R05)', async () => {
  const stage = renderStage({
    scene: { background: disabled, camera: { scale: 2, centerX: 0.3, centerY: 0.4 } },
  });
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomTarget"]')).toBeNull();
  expect(stage.video.style.width).toBe('1600px');
});

it('keeps the identity scene for basic mode without advanced content', async () => {
  const stage = renderStage({ scene: { background: disabled, camera: identity } });
  expect(stage.video.style.left).toBe('0px');
  expect(stage.video.style.top).toBe('0px');
  expect(stage.video.style.width).toBe('800px');
  expect(stage.video.style.height).toBe('450px');
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomTarget"]')).toBeNull();
});

it('maps canvas target drags into normalized content points and restores on escape', async () => {
  const onDrag = vi.fn((_point: { x: number; y: number }) => undefined);
  const stage = renderStage({
    scene: { background: disabled, camera: identity },
    zoom: { camera: { scale: 2, centerX: 0.3, centerY: 0.4 }, onDrag },
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

it('uses export-space padding and radius at every preview size', () => {
  const stage = renderStage({
    scene: {
      background: {
        enabled: true,
        type: 'solid',
        color: '#112233ff',
        layout: { padding: 40, cornerRadius: 12 },
      },
      camera: identity,
    },
  });
  const scale = 800 / source.width;
  expect(Number.parseFloat(stage.video.parentElement!.style.left)).toBe(40 * scale);
  expect(Number.parseFloat(stage.video.parentElement!.style.borderRadius)).toBe(12 * scale);
});
