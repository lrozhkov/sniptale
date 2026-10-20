import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../features/video/project/scene/focus-appearance';
// @vitest-environment jsdom
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { ReviewStageFocusControl } from './stage-focus';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditWindowHeader,
} from '../../features/video/review/advanced/types';
import * as focusEvaluation from '../../features/video/review/advanced/focus';

import { drawReviewBorders } from '../../workflows/video-review/render-border';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewFocusArea } from './focus-area';
import { ReviewSpotlightPreview } from './spotlight-preview';
import { ReviewSpotlightOverlay } from './spotlight-overlay';

import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

vi.mock('../../workflows/video-review/render-border', () => ({ drawReviewBorders: vi.fn() }));
const paint = vi.hoisted(() => vi.fn());
vi.mock('./zoom-preview-paint', () => ({
  paintZoomPreview: paint,
  previewBackgroundPaint: () => '#000000',
}));
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
let root: Root, host: HTMLDivElement;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Path2D', class {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 100)
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  paint.mockClear();
  disconnect.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const output = { width: 200, height: 100 };
const rect = { x: 0, y: 0, ...output };
function render(disabled = false) {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <ReviewSpotlightPreview
        region={{
          ...createQuickEditZoomRegion({ id: 's', at: 0 }),
          spotlight: createQuickEditSpotlight(),
        }}
        camera={{ scale: 1, centerX: 0.5, centerY: 0.5 }}
        view="area"
        frame={null}
        output={output}
        layout={{ contentRect: rect, windowRect: rect, videoRect: rect, videoTransform: rect }}
        cornerRadius={4}
        scale={1}
        disabled={disabled}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  return {
    onChange,
    onPreview,
    group: host.querySelector<HTMLElement>('[role="group"]')!,
    plane: host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!,
  };
}
async function pointer(target: Element, kind: string, x: number, y = 50) {
  await act(async () => {
    const event = new MouseEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  });
}
async function key(target: Element, key: string, shiftKey = false) {
  await act(async () =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, shiftKey }))
  );
}
it('commits one bounded move or resize and discards cancelled drafts', async () => {
  const view = render();
  expect(paint).toHaveBeenCalled();
  await pointer(view.plane, 'pointermove', 60);
  await pointer(view.group, 'pointerdown', 50);
  await pointer(view.plane, 'pointermove', 70);
  expect(view.onChange).not.toHaveBeenCalled();
  expect(view.onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      spotlight: expect.objectContaining({ area: { x: 0.35, y: 0.25, width: 0.5, height: 0.5 } }),
    })
  );
  await pointer(view.plane, 'pointerup', 70);
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      spotlight: expect.objectContaining({ area: { x: 0.35, y: 0.25, width: 0.5, height: 0.5 } }),
    })
  );
  view.onChange.mockClear();
  await pointer(view.group.querySelector('[data-resize="se"]')!, 'pointerdown', 100);
  await pointer(view.plane, 'pointermove', 200, 100);
  await pointer(view.plane, 'pointerup', 200, 100);
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      spotlight: expect.objectContaining({ area: { x: 0.25, y: 0.25, width: 0.75, height: 0.75 } }),
    })
  );
  view.onChange.mockClear();
  for (const cancellation of ['pointercancel', 'lostpointercapture', 'Escape']) {
    await pointer(view.group, 'pointerdown', 50);
    await pointer(view.plane, 'pointermove', 70);
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => view.group.dispatchEvent(arrow));
    expect(arrow.defaultPrevented).toBe(true);
    if (cancellation === 'Escape') await key(view.group, 'Escape');
    else await pointer(view.plane, cancellation, 70);
    await pointer(view.plane, 'pointerup', 70);
  }
  expect(view.onChange).not.toHaveBeenCalled();
});
it('supports keyboard movement, ignores unrelated keys and blocks disabled editing', async () => {
  const view = render();
  for (const direction of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
    await key(view.group, direction, true);
  expect(view.onChange).toHaveBeenCalledTimes(4);
  await key(view.group, 'Enter');
  expect(view.onChange).toHaveBeenCalledTimes(4);
  const disabled = render(true);
  await pointer(disabled.group, 'pointerdown', 50);
  await pointer(disabled.plane, 'pointermove', 70);
  await pointer(disabled.plane, 'pointerup', 70);
  await key(disabled.group, 'ArrowRight');
  expect(disabled.onChange).not.toHaveBeenCalled();
});
it('scales the blur mask and removes its observer when it is hidden', async () => {
  const frame = { opening: { x: 50, y: 25, width: 100, height: 50 }, radius: 4, dim: 0, blur: 12 };
  await act(async () =>
    root.render(<ReviewSpotlightOverlay output={{ width: 400, height: 200 }} frame={frame} />)
  );
  const overlay = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.spotlight"]')!;
  expect(overlay.style.backdropFilter).toBe('blur(6px)');
  expect(decodeURIComponent(overlay.style.maskImage)).toContain('fill-rule="evenodd"');
  await act(async () => root.render(<ReviewSpotlightOverlay output={output} frame={null} />));
  expect(host.children).toHaveLength(0);
  expect(disconnect).toHaveBeenCalled();
});

it.each(['nw', 'ne', 'sw', 'se'])(
  'resizes Spotlight from %s with the opposite edges anchored',
  async (corner) => {
    const view = render();
    expect(view.group.querySelectorAll('[data-resize]')).toHaveLength(4);
    const west = corner.endsWith('w'),
      north = corner.startsWith('n');
    await pointer(view.group.querySelector(`[data-resize="${corner}"]`)!, 'pointerdown', 100, 50);
    await pointer(view.plane, 'pointermove', west ? 80 : 120, north ? 40 : 60);
    expect(view.onChange).not.toHaveBeenCalled();
    await pointer(view.plane, 'pointerup', west ? 80 : 120, north ? 40 : 60);
    expect(view.onChange).toHaveBeenCalledTimes(1);
    const area = view.onChange.mock.calls[0]![0].spotlight.area;
    expect(area.x).toBeCloseTo(west ? 0.15 : 0.25);
    expect(area.y).toBeCloseTo(north ? 0.15 : 0.25);
    expect(area.width).toBeCloseTo(0.6);
    expect(area.height).toBeCloseTo(0.6);
  }
);

it('bounds Spotlight moving edges and reconciles hover after outside release and cancellation', async () => {
  const view = render();
  // Actual group bounds differ from the capture plane; hover must inspect the group.
  vi.spyOn(view.group, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 25, 100, 50));
  await pointer(view.group, 'pointerover', 100, 50);
  expect(view.group.dataset['controlsVisible']).toBe('true');
  await pointer(view.group.querySelector('[data-resize="nw"]')!, 'pointerdown', 50, 25);
  await pointer(view.plane, 'pointermove', 1000, 500);
  expect(view.group.dataset['controlsVisible']).toBe('true');
  await pointer(view.plane, 'pointerup', 1000, 500);
  expect(view.group.dataset['controlsVisible']).toBe('true');
  const area = view.onChange.mock.calls[0]![0].spotlight.area;
  expect(area.width).toBeCloseTo(0.01);
  expect(area.height).toBeCloseTo(0.01);
  expect(area.x + area.width).toBeCloseTo(0.75);
  await pointer(view.group, 'pointerover', 100, 50);
  expect(view.group.dataset['controlsVisible']).toBe('true');
  await pointer(view.group, 'pointerdown', 100, 50);
  await pointer(view.plane, 'pointermove', 1000, 500);
  await key(view.group, 'Escape');
  expect(view.group.dataset['controlsVisible']).toBe('true');
  expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalled();
  expect(view.onChange).toHaveBeenCalledTimes(1);
});

it('keeps the inspector Spotlight frame visible after hover and cancellation', async () => {
  const view = render();
  expect(view.group.getAttribute('data-controls-visible')).toBe('true');
  await pointer(view.plane, 'pointermove', -10, -10);
  expect(view.group.getAttribute('data-controls-visible')).toBe('true');
  await pointer(view.group, 'pointerdown', 50);
  expect(view.group.getAttribute('data-controls-visible')).toBe('true');
  await pointer(view.plane, 'pointermove', 70);
  expect(view.group.getAttribute('data-controls-visible')).toBe('true');
  await key(view.group, 'Escape');
  expect(view.group.getAttribute('data-controls-visible')).toBe('true');
  expect(view.onChange).not.toHaveBeenCalled();
});

it('preserves interaction-only Spotlight controls on the main stage', async () => {
  await act(async () =>
    root.render(
      <ReviewFocusArea
        area={createQuickEditSpotlight().area}
        output={output}
        video={rect}
        onChange={vi.fn()}
      />
    )
  );
  const group = host.querySelector<HTMLElement>('[data-focus-frame]')!;
  const plane = host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!;
  expect(group.dataset['controlsVisible']).toBe('false');
  await pointer(plane, 'pointermove', 60);
  expect(group.dataset['controlsVisible']).toBe('true');
  await pointer(plane, 'pointermove', -10, -10);
  expect(group.dataset['controlsVisible']).toBe('false');
});

it.each([null, 'nw', 'ne', 'sw', 'se'] as const)(
  'hides stage hover controls from pointerdown through movement (%s)',
  async (corner) => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <ReviewFocusArea
          area={createQuickEditSpotlight().area}
          output={output}
          video={rect}
          onChange={onChange}
        />
      )
    );
    const group = host.querySelector<HTMLElement>('[data-focus-frame]')!;
    const plane = host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!;
    await pointer(group, 'pointerover', 60);
    expect(group.dataset['controlsVisible']).toBe('true');
    const target = corner ? group.querySelector(`[data-resize="${corner}"]`)! : group;
    await pointer(target, 'pointerdown', 60);
    expect(group.dataset['controlsVisible']).toBe('false');
    expect(group.dataset['pointerInteraction']).toBe('true');
    await pointer(plane, 'pointermove', 70);
    expect(group.dataset['controlsVisible']).toBe('false');
    await pointer(plane, 'pointerup', 70);
    expect(group.dataset['controlsVisible']).toBe('true');
    expect(onChange).toHaveBeenCalledOnce();
  }
);

it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'Escape', 'blur'])(
  'restores stage hover after %s and never shows it outside the frame',
  async (finish) => {
    const onChange = vi.fn(),
      onPreview = vi.fn();
    act(() =>
      root.render(
        <ReviewFocusArea
          area={createQuickEditSpotlight().area}
          output={output}
          video={rect}
          onChange={onChange}
          onPreview={onPreview}
        />
      )
    );
    const group = host.querySelector<HTMLElement>('[data-focus-frame]')!;
    const plane = host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!;
    for (const endX of [70, 1000]) {
      await pointer(group, 'pointerdown', 60);
      await pointer(plane, 'pointermove', endX);
      expect(group.dataset['controlsVisible']).toBe('false');
      if (finish === 'Escape') await key(group, 'Escape');
      else if (finish === 'blur')
        await act(async () => {
          window.dispatchEvent(new Event('blur'));
        });
      else await pointer(plane, finish, endX);
      expect(group.dataset['controlsVisible']).toBe(String(endX === 70));
      expect(onPreview).toHaveBeenLastCalledWith(null);
    }
    expect(onChange).toHaveBeenCalledTimes(finish === 'pointerup' ? 2 : 0);
  }
);

it('inverts the actual transformed video bounds for source-attached area gestures', async () => {
  const onChange = vi.fn(),
    onPreview = vi.fn();
  await act(async () =>
    root.render(
      <ReviewFocusArea
        area={createQuickEditSpotlight().area}
        output={output}
        video={{ x: -50, y: -25, width: 400, height: 200 }}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  const group = host.querySelector<HTMLElement>('[role="group"]')!;
  const plane = host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!;
  await pointer(group, 'pointerdown', 50, 50);
  await pointer(plane, 'pointermove', 70, 60);
  await pointer(plane, 'pointerup', 70, 60);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith({ x: 0.3, y: 0.3, width: 0.5, height: 0.5 });
  await pointer(group, 'pointerdown', 50, 50);
  await pointer(plane, 'pointermove', 90, 70);
  await key(group, 'Escape');
  await pointer(plane, 'pointerup', 90, 70);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onPreview).toHaveBeenLastCalledWith(null);
});

it('retains the projected source phase clock in Border Result after cut and speed projection', async () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'border', at: 0, duration: 4 }),
    border: {
      ...createQuickEditBorder(),
      style: 'dashed' as const,
      loop: true,
      period: 2,
      segmentPercent: 25,
    },
    enter: { type: 'linear' as const, duration: 1 },
    exit: { type: 'none' as const, duration: 0 },
  };
  const projected = {
    ...region,
    end: 1,
    borderClock: { offset: 1, rate: 2, duration: 4, enter: region.enter, exit: region.exit },
  };
  await act(async () =>
    root.render(
      <ReviewSpotlightPreview
        region={region}
        focus={{ regions: [projected], time: 0.25 }}
        view="result"
        camera={{ scale: 1, centerX: 0.5, centerY: 0.5 }}
        frame={null}
        output={output}
        layout={{ contentRect: rect, windowRect: rect, videoRect: rect, videoTransform: rect }}
        cornerRadius={0}
        scale={1}
        disabled={false}
        onChange={vi.fn()}
      />
    )
  );
  expect(drawReviewBorders).toHaveBeenLastCalledWith(
    expect.anything(),
    output,
    [
      expect.objectContaining({
        // Dashed corners use four chords per quarter-circle (radius 0.5).
        start: expect.closeTo(7.5 / (284 + 16 * Math.sin(Math.PI / 16)), 10),
        end: expect.closeTo(7.5 / (284 + 16 * Math.sin(Math.PI / 16)) + 0.25, 10),
        dashOffset: -7.5,
        opacity: 1,
      }),
    ],
    expect.anything()
  );
});

for (const type of ['border', 'spotlight'] as const) {
  for (const surface of ['stage', 'inspector'] as const) {
    it(`${type} ${surface} reaches the header and restores bounds after scene switches`, async () => {
      const evaluate = vi.spyOn(focusEvaluation, 'evaluateQuickEditSpotlightsAtTime');
      const area = { x: 0.2, y: 0, width: 0.5, height: 0.1 };
      const region = {
        ...createQuickEditZoomRegion({ id: 'header', at: 0, duration: 4 }),
        ...(type === 'border'
          ? { border: { ...createQuickEditBorder(), area } }
          : { spotlight: { ...createQuickEditSpotlight(), area } }),
        enter: { type: 'none' as const, duration: 0 },
        exit: { type: 'none' as const, duration: 0 },
      };
      const onChange = vi.fn();
      const source = { width: 200, height: 100 };
      const header: QuickEditWindowHeader = {
        ...DEFAULT_WINDOW_HEADER,
        kind: 'browser' as const,
        title: 'Header',
      };
      for (const windowHeader of [header, undefined, header]) {
        for (const zoomBehavior of ['fixed', 'follow-video', 'window', 'content'] as const) {
          const background: QuickEditBackgroundSettings = {
            enabled: true,
            type: 'solid',
            color: '#222222',
            layout: { padding: 8, cornerRadius: 4 },
            zoomBehavior,
          };
          for (const scale of [1, 2]) {
            const camera = { scale, centerX: 0.5, centerY: 0.25 };
            const output = computeQuickEditSceneSize({ source, background, windowHeader });
            const layout = computeQuickEditSceneLayout({
              source,
              output,
              background,
              windowHeader,
              camera,
            });
            const expected = {
              x: layout.videoTransform.x,
              y: layout.videoTransform.y - (layout.videoRect.y - layout.windowRect.y) * scale,
              width: layout.windowRect.width * scale,
              height: layout.windowRect.height * scale,
            };
            await act(async () =>
              root.render(
                surface === 'stage' ? (
                  <ReviewStageFocusControl
                    focus={{ region, onChange, onPreview: vi.fn(), onInteract: vi.fn() }}
                    layout={layout}
                    output={output}
                  />
                ) : (
                  <ReviewSpotlightPreview
                    region={region}
                    view="area"
                    camera={camera}
                    frame={null}
                    output={output}
                    layout={layout}
                    background={background}
                    cornerRadius={4}
                    scale={1}
                    disabled={false}
                    onChange={onChange}
                  />
                )
              )
            );
            if (
              surface === 'inspector' &&
              (zoomBehavior === 'window' || zoomBehavior === 'content')
            ) {
              const paint = host.querySelector<HTMLElement>(
                '.pointer-events-none.absolute.inset-0'
              )!;
              expect(paint.style.transform).toBe('translate(0px, 0px) scale(1)');
            }
            const frame = host.querySelector<HTMLElement>('[data-focus-frame]')!;
            expect(parseFloat(frame.style.top)).toBeCloseTo((expected.y / output.height) * 100);
            expect(parseFloat(frame.style.height)).toBeCloseTo(
              ((expected.height * area.height) / output.height) * 100
            );
            if (surface === 'inspector')
              expect(evaluate).toHaveBeenLastCalledWith(
                expect.objectContaining({ video: expected })
              );
            const plane = host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!;
            await pointer(frame, 'pointerdown', 50, 20);
            await pointer(plane, 'pointermove', 50, 25);
            await pointer(plane, 'pointerup', 50, 25);
            expect(onChange).toHaveBeenLastCalledWith({
              [type]: expect.objectContaining({
                area: expect.objectContaining({
                  y: expect.closeTo(5 / ((100 * expected.height) / output.height), 8),
                }),
              }),
            });
          }
        }
      }
    });
  }
}

it('keeps a single edge-clipped spotlight vector-only during live samples', async () => {
  const frame = { opening: { x: 0, y: 40, width: 10, height: 10 }, radius: 2, dim: 0, blur: 12 };
  for (let i = 0; i < 10; i++)
    await act(async () =>
      root.render(
        <ReviewSpotlightOverlay
          output={{ ...output }}
          frames={[{ ...frame }]}
          clip={{ rect: { x: 8, y: 8, width: 184, height: 84 }, radius: 4 }}
        />
      )
    );
  expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  expect(
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.spotlight"]')!.style.maskImage
  ).toContain('svg');
});

it('reuses combined masks across identical live samples and invalidates changed geometry', async () => {
  const frame = { opening: { x: 10, y: 40, width: 10, height: 10 }, radius: 2, dim: 0.5, blur: 12 };
  const show = (x: number) =>
    act(async () =>
      root.render(
        <ReviewSpotlightOverlay
          output={{ ...output }}
          frames={[{ ...frame }, { ...frame, opening: { ...frame.opening, x } }]}
        />
      )
    );
  await show(30);
  const generated = vi.mocked(HTMLCanvasElement.prototype.toDataURL).mock.calls.length;
  expect(generated).toBe(2);
  for (const canvas of vi.mocked(HTMLCanvasElement.prototype.toDataURL).mock.contexts) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected a mask canvas.');
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  }
  for (let i = 0; i < 10; i++) await show(30);
  expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(generated);
  await show(40);
  expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(generated + 2);
});

it('lets Escape reach fullscreen dismissal when no area gesture is active', () => {
  const view = render();
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => view.group.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
});
