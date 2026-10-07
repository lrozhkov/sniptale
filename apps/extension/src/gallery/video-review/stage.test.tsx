import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewStageFocus } from './stage-focus';
import { ReviewStage } from './stage';
import * as headerPreview from './use-window-header';
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

const renderStage = (
  props: Partial<
    Pick<
      Parameters<typeof ReviewStage>[0],
      'scene' | 'zoom' | 'backgroundImageUrl' | 'drawing' | 'region' | 'comments'
    >
  >
) => {
  act(() => {
    root.render(
      <ReviewStage
        url="blob:review"
        source={source}
        video={{ current: null }}
        drawing={props.drawing ?? false}
        region={props.region}
        {...(props.comments ? { comments: props.comments } : {})}
        backgroundImageUrl={props.backgroundImageUrl}
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
  expect(
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.backgroundPlane"]')!.style
      .background
  ).toBe('rgb(17, 34, 51)');
  const clip = stage.video.parentElement!;
  expect(Number.parseFloat(clip.style.left)).toBe(178);
  expect(clip.style.top).toBe('100px');
  expect(Number.parseFloat(clip.style.width)).toBe(444);
  expect(clip.style.height).toBe('250px');
  expect(clip.style.overflow).toBe('hidden');
  // Fitted video inside the padded content rect (letterboxed horizontally).
  const left = Number(stage.video.style.left.replace('px', ''));
  const width = Number(stage.video.style.width.replace('px', ''));
  expect(left).toBe(0);
  expect(Number(stage.video.style.top.replace('px', ''))).toBeCloseTo(0, 6);
  expect(width).toBe(444);
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
  const stage = renderStage({
    scene: { background: disabled, camera: identity, focus: { regions: [zoom.region], time: 2 } },
    zoom,
  });
  expect(host.querySelector('[data-ui="gallery.videoReview.spotlight"]')).not.toBeNull();
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
  await stage.event(area.querySelector('[data-resize="se"]')!, 'pointerdown', 600, 338);
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

it.each([
  [1550, 892],
  [910, 524],
  [530, 708],
])('fills the basic preview raster at %ix%i without a second contain fit', (width, height) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
  const result = renderStage({ scene: { background: disabled, camera: identity } });
  const stage = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.stage"]')!;
  const clip = result.video.parentElement!;
  expect(clip.style.left).toBe('0px');
  expect(clip.style.top).toBe('0px');
  for (const dimension of ['width', 'height'] as const) {
    expect(result.video.style.objectFit).toBe('fill');
    expect(result.video.style[dimension]).toBe(stage.style[dimension]);
    expect(clip.style[dimension]).toBe(stage.style[dimension]);
  }
});

it('restores the source raster after gradient and image scene backgrounds', () => {
  const layout = { padding: 23.7, cornerRadius: 12 };
  renderStage({
    scene: {
      camera: identity,
      background: {
        enabled: true,
        type: 'gradient',
        layout,
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { id: 'a', color: '#111318ff', position: 0, midpoint: 0.5 },
            { id: 'b', color: '#2b2f3aff', position: 1, midpoint: 0.5 },
          ],
          interpolation: 'srgb',
          repeat: { enabled: false, span: 1 },
        },
      },
    },
  });
  const stage = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.stage"]')!;
  expect(
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.backgroundPlane"]')!.style
      .background
  ).toContain('linear-gradient');
  const imageScene = {
    camera: identity,
    background: {
      enabled: true as const,
      type: 'image' as const,
      layout,
      assetId: 'background',
      imageFit: 'cover' as const,
    },
  };
  renderStage({ scene: imageScene, backgroundImageUrl: 'blob:background' });
  expect(host.querySelector('img')?.style.objectFit).toBe('cover');
  expect(
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.backgroundPlane"]')!.style
      .background
  ).toBe('rgb(0, 0, 0)');
  const result = renderStage({ scene: { camera: identity, background: disabled } });
  expect(host.querySelector('img')).toBeNull();
  expect(result.video.parentElement!.style.borderRadius).toBe('');
  expect(result.video.style.width).toBe(stage.style.width);
  expect(result.video.style.height).toBe(stage.style.height);
  expect(result.video.style.objectFit).toBe('fill');
});

it('keeps note-region bounds aligned to the fitted raster when drawing and leaving the scene', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const scene = { camera: identity, background: disabled };
  const view = renderStage({ scene, drawing: true });
  const stage = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.stage"]')!;
  Object.assign(stage, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await view.event(stage, 'pointerdown', 80, 45);
  await view.event(stage, 'pointermove', 400, 225);
  const overlay = host.querySelector<HTMLElement>(
    '[aria-label="gallery.videoReview.selectedRegion"]'
  )!;
  expect(overlay.style.left).toBe('80px');
  expect(overlay.style.top).toBe('45px');
  expect(overlay.style.width).toBe('320px');
  expect(overlay.querySelectorAll('[data-region-corner]')).toHaveLength(4);
  await view.event(stage, 'pointerup', 400, 225);
  renderStage({ scene, region: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 } });
  expect(host.querySelector('[data-region-corner]')).toBeNull();
  expect(
    host.querySelector<HTMLElement>('[aria-label="gallery.videoReview.selectedRegion"]')!.style.left
  ).toBe('80px');
  renderStage({ scene });
  expect(host.querySelector('[aria-label="gallery.videoReview.selectedRegion"]')).toBeNull();
});

it.each(['fixed', 'follow-video'] as const)(
  'keeps %s background and rounded frame aligned during zoom',
  (zoomBehavior) => {
    const background: QuickEditBackgroundSettings = {
      enabled: true,
      type: 'image',
      assetId: 'image',
      imageFit: 'contain',
      zoomBehavior,
      layout: { padding: 0, cornerRadius: 12 },
    };
    for (const scale of [1, 1.25, 2, 1.25, 1]) {
      const { video } = renderStage({
        scene: { background, camera: { ...identity, scale } },
        backgroundImageUrl: 'blob:image',
      });
      const clip = video.parentElement!;
      const follows = zoomBehavior === 'follow-video';
      expect(clip.style.width).toBe(`${800 * (follows ? scale : 1)}px`);
      expect(clip.style.borderRadius).toBe(`${30 * (follows ? scale : 1)}px`);
      expect(video.style.transform).toContain(
        follows
          ? 'translate3d(0px, 0px, 0)'
          : `translate3d(${-(scale - 1) * 400}px, ${-(scale - 1) * 225}px, 0)`
      );
      const plane = host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.backgroundPlane"]'
      )!;
      expect(plane.style.transform).toBe(
        follows
          ? `translate3d(${-(scale - 1) * 400}px, ${-(scale - 1) * 225}px, 0) scale(${scale})`
          : 'translate3d(0px, 0px, 0) scale(1)'
      );
    }
  }
);

it.each(['fixed', 'follow-video'] as const)(
  'keeps the DOM header attached through camera changes with %s background',
  (zoomBehavior) => {
    vi.spyOn(headerPreview, 'useReviewWindowHeader').mockReturnValue({
      joinColor: '#ffffff',
      url: 'data:image/svg+xml,header',
      image: { width: 800, height: 86, close: vi.fn() },
      failed: false,
      retry: vi.fn(),
    });
    const background: QuickEditBackgroundSettings = {
      enabled: true,
      type: 'solid',
      color: '#123456ff',
      zoomBehavior,
      layout: { padding: 10, cornerRadius: 12 },
    };
    for (const scale of [1, 1.2, 2, 4])
      for (const center of [0, 0.5, 1]) {
        const { video } = renderStage({
          scene: {
            background,
            camera: { scale, centerX: center, centerY: center },
            windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'Browser' },
          },
        });
        const header = host.querySelector('img')!;
        expect(header.style.left).toBe('0px');
        expect(header.style.top).toBe('0px');
        expect(header.style.transform).toBe(`${video.style.transform} translateY(-100%)`);
        expect(header.style.transformOrigin).toBe(video.style.transformOrigin);
        expect(header.style.width).toBe(video.style.width);
        expect(header.parentElement).toBe(video.parentElement);
        expect(video.parentElement!.style.overflow).toBe('hidden');
      }
  }
);

it('recomputes the decorated pan plane and top boundary across header and background switches', () => {
  vi.spyOn(headerPreview, 'useReviewWindowHeader').mockReturnValue({
    joinColor: '#ffffff',
    url: 'data:image/svg+xml,header',
    image: { width: 800, height: 86, close: vi.fn() },
    failed: false,
    retry: vi.fn(),
  });
  const camera = { scale: 4, centerX: 0.5, centerY: 0 };
  const region = {
    id: 'top',
    start: 0,
    end: 4,
    transform: camera,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  for (const zoomBehavior of ['fixed', 'follow-video', 'fixed'] as const) {
    for (const windowHeader of [
      { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
      undefined,
      { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
    ]) {
      const { video } = renderStage({
        scene: {
          camera,
          windowHeader,
          background: {
            enabled: true,
            type: 'solid',
            color: '#000000ff',
            zoomBehavior,
            layout: { padding: 10, cornerRadius: 12 },
          },
        },
        zoom: { region, onChange: vi.fn(), onPreview: vi.fn(), onInteract: vi.fn() },
      });
      const target = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomTarget"]')!;
      const header = host.querySelector('img');
      if (windowHeader) {
        expect(Number.parseFloat(header!.style.top)).toBeCloseTo(0);
        expect(Number.parseFloat(target.style.height)).toBeGreaterThan(
          Number.parseFloat(video.style.height)
        );
      } else
        expect(Number.parseFloat(target.style.height)).toBeCloseTo(
          Number.parseFloat(video.style.height)
        );
    }
  }
});

it('uses the scene canvas scale for projected comments at rounded window corners', async () => {
  const { createCanvasComment } = await import('../../features/video/review/comments');
  const { createQuickEditZoomRegion } = await import('../../features/video/review/advanced/zoom');
  const { quickEditSpatialTargetCamera, DEFAULT_QUICK_EDIT_PERSPECTIVE } =
    await import('../../features/video/review/advanced/spatial');
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#333333',
    layout: { padding: 20, cornerRadius: 24 },
  };
  const camera = quickEditSpatialTargetCamera({
    ...createQuickEditZoomRegion({ id: 'z', at: 0 }),
    perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: 35 },
  });
  renderStage({
    scene: { background, camera, canvas: { width: 640, height: 360 } },
    comments: {
      items: [
        { ...createCanvasComment({ id: 'corner' }), text: 'Corner', position: { x: 0, y: 0 } },
      ],
      annotations: [],
      time: 0,
      background,
      camera,
      selectedId: null,
      busy: false,
      onSelect: vi.fn(),
      onMove: vi.fn(),
    },
  });
  const overlay = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.commentOverlay"]'
  )!;
  // 24px scene radius * (800 output / 640 canvas) * 1.5 outer zoom = 45px, not75px from source320.
  expect(overlay.style.clipPath).toContain('round 45px');
});
