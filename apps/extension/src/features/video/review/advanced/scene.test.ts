import { describe, expect, it } from 'vitest';
import {
  computeQuickEditContentRect,
  computeQuickEditSceneLayout,
  computeQuickEditVideoTransform,
  evaluateQuickEditCameraAtTime,
  quickEditCanvasPointToContent,
  quickEditContentPointToCanvas,
} from './scene';
import type { QuickEditZoomRegion } from './types';

const region = (
  overrides: Partial<QuickEditZoomRegion> & Pick<QuickEditZoomRegion, 'start' | 'end'>
): QuickEditZoomRegion => ({
  id: 'z',
  transform: { scale: 2, centerX: 0.25, centerY: 0.75 },
  enter: { type: 'ease-in-out', duration: 0.5 },
  exit: { type: 'linear', duration: 0.5 },
  ...overrides,
});

describe('computeQuickEditContentRect', () => {
  it('insets the output frame by background padding and stays full without background', () => {
    expect(computeQuickEditContentRect({ width: 800, height: 600 }, { enabled: false })).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(
      computeQuickEditContentRect(
        { width: 800, height: 600 },
        {
          enabled: true,
          type: 'solid',
          color: '#000000ff',
          layout: { padding: 40, cornerRadius: 0 },
        }
      )
    ).toEqual({ x: 40, y: 40, width: 720, height: 520 });
    expect(
      computeQuickEditContentRect(
        { width: 1, height: 1 },
        {
          enabled: true,
          type: 'solid',
          color: '#000000ff',
          layout: { padding: 40, cornerRadius: 0 },
        }
      )
    ).toEqual({ x: 0.5, y: 0.5, width: 1, height: 1 });
  });
});

describe('computeQuickEditSceneLayout', () => {
  const layout = (padding: number) =>
    computeQuickEditSceneLayout({
      output: { width: 1920, height: 1080 },
      source: { width: 1920, height: 1080 },
      background: {
        enabled: true,
        type: 'solid',
        color: '#000000ff',
        layout: { padding, cornerRadius: 0 },
      },
      camera: { scale: 1.8, centerX: 0.73, centerY: 0.44 },
    });

  it('keeps the semantic camera target while only the canvas conversion changes', () => {
    const small = layout(40);
    const large = layout(120);
    expect(small.contentRect).not.toEqual(large.contentRect);
    const smallPoint = quickEditContentPointToCanvas({ x: 0.73, y: 0.44 }, small.videoTransform);
    const largePoint = quickEditContentPointToCanvas({ x: 0.73, y: 0.44 }, large.videoTransform);
    expect(smallPoint).not.toEqual(largePoint);
    // The same content point stays the camera focus inside its own layout.
    expect(smallPoint).toEqual({
      x: small.videoRect.x + 0.73 * small.videoRect.width,
      y: small.videoRect.y + 0.44 * small.videoRect.height,
    });
  });

  it('uses an identical normalized model for vertical and horizontal video', () => {
    const horizontal = computeQuickEditSceneLayout({
      output: { width: 1920, height: 1080 },
      source: { width: 1920, height: 1080 },
      background: { enabled: false },
      camera: { scale: 2, centerX: 0.25, centerY: 0.75 },
    });
    const vertical = computeQuickEditSceneLayout({
      output: { width: 1080, height: 1920 },
      source: { width: 1080, height: 1920 },
      background: { enabled: false },
      camera: { scale: 2, centerX: 0.25, centerY: 0.75 },
    });
    expect(horizontal.videoRect.width / horizontal.videoRect.height).toBe(16 / 9);
    expect(vertical.videoRect.width / vertical.videoRect.height).toBe(9 / 16);
    expect(quickEditContentPointToCanvas({ x: 0.25, y: 0.75 }, horizontal.videoTransform)).toEqual({
      x: horizontal.videoRect.x + 0.25 * horizontal.videoRect.width,
      y: horizontal.videoRect.y + 0.75 * horizontal.videoRect.height,
    });
  });

  it('keeps identity camera equal to the fitted video rect', () => {
    const { videoRect, videoTransform } = computeQuickEditSceneLayout({
      output: { width: 800, height: 600 },
      source: { width: 1000, height: 500 },
      background: { enabled: false },
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    expect(videoTransform).toEqual(videoRect);
  });
});

describe('point conversion round trip', () => {
  it('maps content points through zoom and back', () => {
    const videoRect = { x: 100, y: 50, width: 400, height: 300 };
    const camera = { scale: 2, centerX: 0.25, centerY: 0.25 };
    const transform = computeQuickEditVideoTransform({ videoRect, camera });
    const content = { x: 0.3, y: 0.4 };
    const canvas = quickEditContentPointToCanvas(content, transform);
    expect(quickEditCanvasPointToContent(canvas, transform)).toEqual(content);
    // The camera focus point stays fixed relative to the unscaled video position.
    expect(quickEditContentPointToCanvas({ x: 0.25, y: 0.25 }, transform)).toEqual({
      x: videoRect.x + 0.25 * videoRect.width,
      y: videoRect.y + 0.25 * videoRect.height,
    });
  });

  it('rejects canvas points outside the transformed video', () => {
    const transform = { x: 0, y: 0, width: 100, height: 100 };
    expect(quickEditCanvasPointToContent({ x: 150, y: 50 }, transform)).toBeNull();
    expect(quickEditCanvasPointToContent({ x: 50, y: -1 }, transform)).toBeNull();
    expect(quickEditCanvasPointToContent({ x: 50, y: 50 }, transform)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('evaluateQuickEditCameraAtTime', () => {
  it('is identity outside regions and ramps enter/exit transitions', () => {
    const regions = [
      region({
        start: 1,
        end: 5,
        enter: { type: 'linear', duration: 1 },
        exit: { type: 'linear', duration: 1 },
      }),
    ];
    expect(evaluateQuickEditCameraAtTime(regions, 0)).toEqual({
      scale: 1,
      centerX: 0.5,
      centerY: 0.5,
    });
    expect(evaluateQuickEditCameraAtTime(regions, 1)).toEqual({
      scale: 1,
      centerX: 0.5,
      centerY: 0.5,
    });
    expect(evaluateQuickEditCameraAtTime(regions, 1.5)).toEqual({
      scale: 1.5,
      centerX: 0.375,
      centerY: 0.625,
    });
    expect(evaluateQuickEditCameraAtTime(regions, 2)).toEqual(regions[0]!.transform);
    expect(evaluateQuickEditCameraAtTime(regions, 4.5)).toEqual({
      scale: 1.5,
      centerX: 0.375,
      centerY: 0.625,
    });
    expect(evaluateQuickEditCameraAtTime(regions, 5)).toEqual({
      scale: 1,
      centerX: 0.5,
      centerY: 0.5,
    });
  });

  it('jumps for none transitions and eases smoothstep progress', () => {
    const instant = [
      region({
        start: 1,
        end: 3,
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      }),
    ];
    expect(evaluateQuickEditCameraAtTime(instant, 1)).toEqual(instant[0]!.transform);
    expect(evaluateQuickEditCameraAtTime(instant, 3)).toEqual({
      scale: 1,
      centerX: 0.5,
      centerY: 0.5,
    });
    const eased = [
      region({
        start: 0,
        end: 4,
        enter: { type: 'ease-in-out', duration: 1 },
        exit: { type: 'ease-in-out', duration: 0 },
      }),
    ];
    expect(evaluateQuickEditCameraAtTime(eased, 0.25)).toEqual({
      scale: 1 + 0.15625,
      centerX: 0.5 - 0.25 * 0.15625,
      centerY: 0.5 + 0.25 * 0.15625,
    });
  });

  it('hands adjacent regions over exactly at the shared boundary', () => {
    const adjacent = [
      region({
        id: 'a',
        start: 0,
        end: 2,
        transform: { scale: 2, centerX: 0.2, centerY: 0.2 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      }),
      region({
        id: 'b',
        start: 2,
        end: 4,
        transform: { scale: 3, centerX: 0.8, centerY: 0.8 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      }),
    ];
    expect(evaluateQuickEditCameraAtTime(adjacent, 1.999)).toEqual(adjacent[0]!.transform);
    expect(evaluateQuickEditCameraAtTime(adjacent, 2)).toEqual(adjacent[1]!.transform);
  });
});

it('holds a none exit at the target until the region actually ends (Z5)', () => {
  const held = [
    region({
      start: 0,
      end: 2,
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0.3 },
    }),
  ];
  expect(evaluateQuickEditCameraAtTime(held, 1.8)).toEqual(held[0]!.transform);
  expect(evaluateQuickEditCameraAtTime(held, 2)).toEqual({ scale: 1, centerX: 0.5, centerY: 0.5 });
});

it('normalizes over-long transitions so a short region reaches its target (Z4)', () => {
  const short = [
    region({
      start: 0,
      end: 0.1,
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'ease-in-out', duration: 0.3 },
      exit: { type: 'ease-in-out', duration: 0.3 },
    }),
  ];
  expect(evaluateQuickEditCameraAtTime(short, 0.05)).toEqual(short[0]!.transform);
});

it('connects two zoom targets through the gap without returning to the full frame', () => {
  const first = { ...region({ id: 'first', start: 0, end: 2 }), linkTo: 'next' };
  const next = region({
    id: 'next',
    start: 4,
    end: 6,
    transform: { scale: 3, centerX: 0.75, centerY: 0.25 },
  });
  expect(evaluateQuickEditCameraAtTime([first, next], 2)).toEqual(first.transform);
  expect(evaluateQuickEditCameraAtTime([first, next], 3)).toEqual({
    scale: 2.5,
    centerX: 0.5,
    centerY: 0.5,
  });
  expect(evaluateQuickEditCameraAtTime([first, next], 4)).toEqual(next.transform);
  expect(evaluateQuickEditCameraAtTime([first], 3).scale).toBe(1);
});

it('applies the stored link easing and keeps the legacy smooth default', () => {
  const next = region({
    id: 'next',
    start: 4,
    end: 6,
    transform: { scale: 3, centerX: 0.5, centerY: 0.5 },
  });
  // t=2.5 sits at gap progress 0.25: linear lerps exactly a quarter of the way.
  const linear = {
    ...region({ id: 'first', start: 0, end: 2 }),
    linkTo: 'next',
    linkEasing: 'linear' as const,
  };
  const linearCamera = evaluateQuickEditCameraAtTime([linear, next], 2.5);
  expect(linearCamera.scale).toBeCloseTo(2.25);
  expect(linearCamera.centerX).toBeCloseTo(0.3125);
  expect(linearCamera.centerY).toBeCloseTo(0.6875);
  // Missing linkEasing keeps the pre-setting smooth curve: smoothstep(0.25)=0.15625.
  const legacy = { ...region({ id: 'first', start: 0, end: 2 }), linkTo: 'next' };
  const legacyCamera = evaluateQuickEditCameraAtTime([legacy, next], 2.5);
  expect(legacyCamera.scale).toBeCloseTo(2 + 0.15625);
  expect(legacyCamera.centerX).toBeCloseTo(0.25 + 0.25 * 0.15625);
  const smooth = { ...legacy, linkEasing: 'ease-in-out' as const };
  expect(evaluateQuickEditCameraAtTime([smooth, next], 2.5)).toEqual(legacyCamera);
});
