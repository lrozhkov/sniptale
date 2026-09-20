// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewStageFocus } from './stage-focus';
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
  scene?: {
    background: QuickEditBackgroundSettings;
    camera: QuickEditCameraTransform;
    canvas?: { width: number; height: number };
  };
  zoom?: ReviewStageFocus;
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
  expect(stage.video.style.transform).toBe('translate3d(-400px, -225px, 0) scale(2)');
  expect(stage.video.style.top).toBe('0px');
  expect(stage.video.style.width).toBe('800px');
  expect(stage.video.style.height).toBe('450px');
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
  expect(Number.parseFloat(clip.style.left)).toBeCloseTo(177.7778);
  expect(clip.style.top).toBe('100px');
  expect(Number.parseFloat(clip.style.width)).toBeCloseTo(444.4444);
  expect(clip.style.height).toBe('250px');
  expect(clip.style.overflow).toBe('hidden');
  // Fitted video inside the padded content rect (letterboxed horizontally).
  const left = Number(stage.video.style.left.replace('px', ''));
  const width = Number(stage.video.style.width.replace('px', ''));
  expect(left).toBe(0);
  expect(Number(stage.video.style.top.replace('px', ''))).toBeCloseTo(0, 6);
  expect(width).toBeCloseTo(444.44, 1);
  expect(Number(stage.video.style.height.replace('px', ''))).toBeCloseTo(250, 6);
});

it('keeps the scene applied when the zoom selection is absent (R05)', async () => {
  const stage = renderStage({
    scene: { background: disabled, camera: { scale: 2, centerX: 0.3, centerY: 0.4 } },
  });
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomTarget"]')).toBeNull();
  expect(stage.video.style.width).toBe('800px');
});

it('keeps the identity scene for basic mode without advanced content', async () => {
  const stage = renderStage({ scene: { background: disabled, camera: identity } });
  expect(stage.video.style.left).toBe('0px');
  expect(stage.video.style.top).toBe('0px');
  expect(stage.video.style.width).toBe('800px');
  expect(stage.video.style.height).toBe('450px');
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomTarget"]')).toBeNull();
});

it('pans the grabbed frame with stable deltas and cancels without a commit', async () => {
  const onPreview = vi.fn(),
    onChange = vi.fn(),
    onInteract = vi.fn();
  const zoom: ReviewStageFocus = {
    region: {
      id: 'z',
      start: 0,
      end: 4,
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    },
    onPreview,
    onChange,
    onInteract,
  };
  const stage = renderStage({ scene: { background: disabled, camera: identity }, zoom });
  const target = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomTarget"]')!;
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 450));
  Object.assign(target, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await stage.event(target, 'pointerdown', 300, 200);
  expect(onPreview).toHaveBeenLastCalledWith({ centerX: 0.5, centerY: 0.5 });
  expect(onInteract).toHaveBeenCalledOnce();
  await stage.event(target, 'pointermove', 380, 245);
  expect(onPreview).toHaveBeenLastCalledWith({ centerX: 0.45, centerY: 0.45 });
  renderStage({
    scene: { background: disabled, camera: identity },
    zoom: {
      ...zoom,
      region: { ...zoom.region, transform: { scale: 2, centerX: 0.45, centerY: 0.45 } },
    },
  });
  await stage.event(target, 'pointermove', 460, 290);
  expect(onPreview).toHaveBeenLastCalledWith({ centerX: 0.4, centerY: 0.4 });
  expect(onChange).not.toHaveBeenCalled();
  const arrow = new KeyboardEvent('keydown', {
    key: 'ArrowRight',
    bubbles: true,
    cancelable: true,
  });
  await act(async () => target.dispatchEvent(arrow));
  expect(arrow.defaultPrevented).toBe(true);
  await act(async () =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(onPreview).toHaveBeenLastCalledWith(null);
  await stage.event(target, 'pointerup', 460, 290);
  expect(onChange).not.toHaveBeenCalled();
  await stage.event(target, 'pointerdown', 300, 200);
  await stage.event(target, 'pointermove', 380, 245);
  await stage.event(target, 'pointerup', 380, 245);
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenLastCalledWith({ centerX: 0.4, centerY: 0.4 });
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
  expect(Number.parseFloat(stage.video.parentElement!.style.top)).toBe(40 * scale);
  expect(Number.parseFloat(stage.video.parentElement!.style.borderRadius)).toBe(12 * scale);
});

it('fits a landscape source inside the selected portrait canvas without stretching it', () => {
  const result = renderStage({
    scene: { background: disabled, camera: identity, canvas: { width: 1080, height: 1920 } },
  });
  const stage = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.stage"]')!;
  expect(Number.parseFloat(stage.style.width) / Number.parseFloat(stage.style.height)).toBeCloseTo(
    9 / 16
  );
  expect(
    Number.parseFloat(result.video.style.width) / Number.parseFloat(result.video.style.height)
  ).toBeCloseTo(16 / 9);
  expect(Number.parseFloat(result.video.parentElement!.style.top)).toBeGreaterThan(0);
});

it('keeps video layout fixed throughout slow zoom and clips its fitted corners at rest', () => {
  const background: QuickEditBackgroundSettings = {
    enabled: true,
    type: 'solid',
    color: '#112233ff',
    layout: { padding: 40, cornerRadius: 12 },
  };
  const first = renderStage({ scene: { background, camera: identity } });
  const width = first.video.style.width;
  expect(Number.parseFloat(first.video.parentElement!.style.width)).toBeCloseTo(
    Number.parseFloat(width)
  );
  const next = renderStage({
    scene: { background, camera: { scale: 1.001, centerX: 0.5001, centerY: 0.5 } },
  });
  expect(next.video.style.width).toBe(width);
  expect(next.video.style.transform).toContain('scale(1.001)');
  expect(next.video.style.transformOrigin).toBe('0 0');
});

it('moves and resizes spotlight on the stage with live preview and one durable commit', async () => {
  const onPreview = vi.fn(),
    onChange = vi.fn(),
    onInteract = vi.fn();
  const zoom: ReviewStageFocus = {
    region: {
      id: 's',
      start: 0,
      end: 4,
      transform: identity,
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      spotlight: {
        area: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        effect: 'dim',
        strength: 0.65,
        blur: 12,
        roundness: 0.04,
        reveal: 'fade',
        exitReveal: 'fade',
      },
    },
    onPreview,
    onChange,
    onInteract,
  };
  const stage = renderStage({ scene: { background: disabled, camera: identity }, zoom });
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.focusArea"]')!;
  const area = plane.querySelector<HTMLElement>('[role="group"]')!;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 450));
  Object.assign(plane, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await stage.event(area, 'pointerdown', 400, 225);
  await stage.event(plane, 'pointermove', 480, 270);
  expect(onPreview).toHaveBeenLastCalledWith({
    spotlight: {
      ...zoom.region.spotlight,
      area: { x: 0.35, y: 0.35, width: 0.5, height: 0.5 },
    },
  });
  expect(onChange).not.toHaveBeenCalled();
  await stage.event(plane, 'pointercancel', 480, 270);
  expect(onPreview).toHaveBeenLastCalledWith(null);
  await stage.event(area.querySelector('[data-resize]')!, 'pointerdown', 600, 338);
  await stage.event(plane, 'pointermove', 680, 383);
  await stage.event(plane, 'pointerup', 680, 383);
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenLastCalledWith({
    spotlight: {
      ...zoom.region.spotlight,
      area: { x: 0.25, y: 0.25, width: 0.6, height: 0.6 },
    },
  });
  expect(onInteract).toHaveBeenCalledTimes(2);
});
