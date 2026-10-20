import { updateQuickEditBackground } from './background';
import { describe, expect, it } from 'vitest';
import {
  computeQuickEditContentRect,
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
  computeQuickEditVideoTransform,
  evaluateQuickEditCameraAtTime,
  quickEditCanvasPointToContent,
  quickEditContentPointToCanvas,
} from './scene';
import type { QuickEditZoomRegion } from './types';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE,
  DEFAULT_CAMERA_DEPTH as DEFAULT_QUICK_EDIT_DEPTH,
} from '../../project/motion/spatial';
import {
  quickEditPlaneProjection,
  projectQuickEditPoint,
  invertQuickEditProjection,
} from '../../composition/motion/spatial-geometry';
import {
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditWindowTransform,
} from './scene';

it.each(['window', 'content'] as const)(
  'keeps %s geometry continuous and invertible through ordinary/perspective chains at 30/60 FPS',
  (zoomBehavior) => {
    const poses: QuickEditZoomRegion[] = [
      {
        id: 'ordinary',
        start: 0,
        end: 2,
        transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'linear', duration: 0.5 },
        exit: { type: 'linear', duration: 0.5 },
        linkTo: 'tilt',
      },
      {
        id: 'tilt',
        start: 3,
        end: 5,
        transform: { scale: 2, centerX: 0.35, centerY: 0.4 },
        enter: { type: 'linear', duration: 0.5 },
        exit: { type: 'linear', duration: 0.5 },
        linkTo: 'rotation',
        perspective: {
          ...DEFAULT_QUICK_EDIT_PERSPECTIVE,
          enabled: true,
          rotateX: 20,
          rotateY: -30,
        },
        depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'area' },
      },
      {
        id: 'rotation',
        start: 6,
        end: 8,
        transform: { scale: 1.15, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'linear', duration: 0.5 },
        exit: { type: 'linear', duration: 0.5 },
        perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateZ: 25 },
        depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'depth' },
      },
    ];
    const layouts = [
      {
        source: { width: 640, height: 360 },
        background: updateQuickEditBackground(
          { enabled: false, zoomBehavior },
          { type: 'gradient' }
        ),
      },
      {
        source: { width: 640, height: 360 },
        background: { enabled: false as const, zoomBehavior },
      },
      {
        source: { width: 360, height: 640 },
        background: {
          enabled: true as const,
          type: 'solid' as const,
          color: '#123456ff',
          zoomBehavior,
          layout: { padding: 30, cornerRadius: 12 },
        },
      },
      {
        source: { width: 640, height: 360 },
        background: {
          enabled: true as const,
          type: 'image' as const,
          assetId: 'project-background',
          imageFit: 'cover' as const,
          zoomBehavior,
          layout: { padding: 20, cornerRadius: 12 },
        },
      },
    ];
    for (const settings of layouts) {
      const output = { width: 640, height: 450 };
      const at = (time: number) =>
        computeQuickEditSceneLayout({
          ...settings,
          output,
          camera: evaluateQuickEditCameraAtTime(poses, time),
          windowHeader: DEFAULT_WINDOW_HEADER,
        });
      for (const fps of [30, 60])
        for (let frame = 0; frame <= fps * 8; frame++) {
          const layout = at(frame / fps);
          const motion = computeQuickEditSceneCamera(layout, settings.background);
          expect([motion.backgroundScale, motion.x, motion.y]).toEqual([1, 0, 0]);
          const target = computeQuickEditSpatialWindow(layout, settings.background);
          expect(target).toEqual(
            zoomBehavior === 'window' ? computeQuickEditWindowTransform(layout) : layout.windowRect
          );
          const raster = computeQuickEditSpatialRasterLayout(layout, settings.background);
          expect(raster.videoTransform.width / raster.videoRect.width).toBeCloseTo(
            zoomBehavior === 'window' ? 1 : layout.videoTransform.width / layout.videoRect.width,
            8
          );
          if (layout.spatial) {
            const matrix = quickEditPlaneProjection(layout.windowRect, target, layout.spatial);
            const point = { x: layout.windowRect.x, y: layout.windowRect.y };
            const projected = projectQuickEditPoint(matrix, point)!;
            const restored = projectQuickEditPoint(invertQuickEditProjection(matrix)!, projected)!;
            expect(restored.x).toBeCloseTo(point.x, 6);
            expect(restored.y).toBeCloseTo(point.y, 6);
          }
        }
      for (const time of [0.5, 2, 3, 5, 6, 7.5, 8]) {
        const left = computeQuickEditSpatialWindow(at(time - 1e-7), settings.background);
        const right = computeQuickEditSpatialWindow(at(time + 1e-7), settings.background);
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(left[key]).toBeCloseTo(right[key], 3);
      }
    }
  }
);

it.each(['window', 'content'] as const)(
  'keeps the background stationary in %s mode with or without perspective',
  (zoomBehavior) => {
    for (const spatial of [
      undefined,
      {
        rotation: [0, 0, 0, 1] as const,
        perspective: 0.5,
        windowMotion: 0.2,
        lockBackground: true,
        focus: [],
      },
    ]) {
      const layout = {
        videoRect: { x: 40, y: 60, width: 200, height: 100 },
        windowRect: { x: 40, y: 40, width: 200, height: 120 },
        videoTransform: { x: -60, y: 20, width: 400, height: 200 },
        ...(spatial ? { spatial } : {}),
      };
      const background = { enabled: false as const, zoomBehavior };
      const motion = computeQuickEditSceneCamera(layout, background);
      expect(motion.backgroundScale).toBe(1);
      expect(motion.x).toBe(0);
      expect(motion.y).toBe(0);
      expect(motion.windowClip).toEqual(
        zoomBehavior === 'window' ? { x: -60, y: -20, width: 400, height: 240 } : layout.windowRect
      );
      expect(motion.scale).toBe(zoomBehavior === 'window' ? 2 : 1);
    }
  }
);

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
    // The target is centered vertically and clamped against the right video edge.
    expect(smallPoint.x).toBeCloseTo(
      small.videoRect.x + (0.73 * 1.8 - 0.8) * small.videoRect.width
    );
    expect(smallPoint.y).toBeCloseTo(small.videoRect.y + 0.5 * small.videoRect.height);
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
      x: horizontal.videoRect.x + 0.5 * horizontal.videoRect.width,
      y: horizontal.videoRect.y + 0.5 * horizontal.videoRect.height,
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
    // An in-bounds camera target is centered in the visible video.
    expect(quickEditContentPointToCanvas({ x: 0.25, y: 0.25 }, transform)).toEqual({
      x: videoRect.x + 0.5 * videoRect.width,
      y: videoRect.y + 0.5 * videoRect.height,
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
      centerX: 1 / 3,
      centerY: 2 / 3,
    });
    expect(evaluateQuickEditCameraAtTime(regions, 2)).toEqual(regions[0]!.transform);
    expect(evaluateQuickEditCameraAtTime(regions, 4.5)).toEqual({
      scale: 1.5,
      centerX: 1 / 3,
      centerY: 2 / 3,
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
      centerX: 0.5 / 1.15625,
      centerY: (0.5 + 0.15625) / 1.15625,
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
    centerX: 0.55,
    centerY: 0.45,
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
  expect(linearCamera.centerX).toBeCloseTo(0.75 / 2.25);
  expect(linearCamera.centerY).toBeCloseTo(1.5 / 2.25);
  // Missing linkEasing keeps the pre-setting smooth curve: smoothstep(0.25)=0.15625.
  const legacy = { ...region({ id: 'first', start: 0, end: 2 }), linkTo: 'next' };
  const legacyCamera = evaluateQuickEditCameraAtTime([legacy, next], 2.5);
  expect(legacyCamera.scale).toBeCloseTo(2 + 0.15625);
  expect(legacyCamera.centerX).toBeCloseTo((0.5 + 0.15625) / 2.15625);
  const smooth = { ...legacy, linkEasing: 'ease-in-out' as const };
  expect(evaluateQuickEditCameraAtTime([smooth, next], 2.5)).toEqual(legacyCamera);
});

it('moves rendered translation and scale together toward an off-center crop', () => {
  const zoom = region({
    start: 0,
    end: 4,
    enter: { type: 'linear', duration: 1 },
    transform: { scale: 3, centerX: 0.8, centerY: 0.2 },
  });
  const videoRect = { x: 20, y: 10, width: 900, height: 600 };
  const target = computeQuickEditVideoTransform({ videoRect, camera: zoom.transform });
  expect(target.x).toBeCloseTo(20 - 1.9 * 900);
  expect(target.y).toBeCloseTo(10 - 0.1 * 600);
  for (const progress of [0.1, 0.25, 0.5, 0.75]) {
    const actual = computeQuickEditVideoTransform({
      videoRect,
      camera: evaluateQuickEditCameraAtTime([zoom], progress),
    });
    expect(actual.x).toBeCloseTo(videoRect.x + (target.x - videoRect.x) * progress);
    expect(actual.y).toBeCloseTo(videoRect.y + (target.y - videoRect.y) * progress);
    expect(actual.width).toBeCloseTo(900 * (1 + 2 * progress));
  }
});

it('keeps rendered translation and scale monotonic across a long slow camera transition', () => {
  const zoom = region({
    start: 0,
    end: 90,
    enter: { type: 'ease-in-out', duration: 60 },
    exit: { type: 'none', duration: 0 },
    transform: { scale: 2.7, centerX: 0.8, centerY: 0.3 },
  });
  let previous = { x: 0, y: 0, width: 1920, height: 1080 };
  for (let frame = 0; frame <= 3600; frame++) {
    const camera = evaluateQuickEditCameraAtTime([zoom], frame / 60);
    const next = computeQuickEditVideoTransform({
      videoRect: { x: 0, y: 0, width: 1920, height: 1080 },
      camera,
    });
    expect(next.x).toBeLessThanOrEqual(previous.x + 1e-9);
    expect(next.y).toBeLessThanOrEqual(previous.y + 1e-9);
    expect(next.width).toBeGreaterThanOrEqual(previous.width - 1e-9);
    previous = next;
  }
});

it('does not let an inactive transition shorten the opposite phase', () => {
  const camera = evaluateQuickEditCameraAtTime(
    [
      region({
        start: 0,
        end: 2,
        enter: { type: 'none', duration: 60 },
        exit: { type: 'linear', duration: 2 },
      }),
    ],
    1
  );
  expect(camera.scale).toBeCloseTo(1.5);
});

it.each(['none', 'linear', 'ease-in-out'] as const)(
  'keeps background coverage throughout %s zoom with edge camera targets',
  (type) => {
    for (const output of [
      { width: 800, height: 450 },
      { width: 450, height: 800 },
    ]) {
      for (const center of [0, 0.5, 1]) {
        const regions = [
          {
            id: 'zoom',
            start: 0,
            end: 4,
            transform: { scale: 3, centerX: center, centerY: center },
            enter: { type, duration: 1 },
            exit: { type, duration: 1 },
          },
        ];
        for (const time of [0, 0.25, 0.5, 1, 2, 3.5, 3.75, 4]) {
          const camera = evaluateQuickEditCameraAtTime(regions, time);
          const background = {
            enabled: true as const,
            type: 'solid' as const,
            color: '#000000ff',
            zoomBehavior: 'follow-video' as const,
            layout: { padding: 40, cornerRadius: 20 },
          };
          const layout = computeQuickEditSceneLayout({
            output,
            canvas: output,
            source: { width: 800, height: 450 },
            background,
            camera,
          });
          const motion = computeQuickEditSceneCamera(layout, background);
          expect(motion.videoClip).toEqual(layout.videoTransform);
          expect(motion.x).toBeLessThanOrEqual(0.000001);
          expect(motion.y).toBeLessThanOrEqual(0.000001);
          expect(motion.x + output.width * motion.scale).toBeGreaterThanOrEqual(
            output.width - 0.000001
          );
          expect(motion.y + output.height * motion.scale).toBeGreaterThanOrEqual(
            output.height - 0.000001
          );
          expect(
            computeQuickEditSceneCamera(layout, { ...background, zoomBehavior: 'fixed' })
          ).toEqual({
            x: 0,
            y: 0,
            scale: 1,
            backgroundScale: 1,
            videoClip: layout.videoRect,
            windowClip: layout.windowRect,
          });
        }
      }
    }
  }
);

it.each(['linear', 'ease-in-out'] as const)(
  'keeps 30 FPS camera geometry continuous across entrance, hold, linked zoom-out and exit (%s)',
  (type) => {
    const regions = [
      region({
        id: 'a',
        start: 0,
        end: 3,
        linkTo: 'b',
        linkEasing: type,
        transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
        enter: { type, duration: 1 },
        exit: { type, duration: 1 },
      }),
      region({
        id: 'b',
        start: 6,
        end: 9,
        transform: { scale: 1.15, centerX: 0.5, centerY: 0.5 },
        enter: { type, duration: 1 },
        exit: { type, duration: 1 },
      }),
    ];
    for (const boundary of [1, 3, 6, 8, 9]) {
      const left = evaluateQuickEditCameraAtTime(regions, boundary - 1e-7);
      const right = evaluateQuickEditCameraAtTime(regions, boundary + 1e-7);
      expect(Math.abs(left.scale - right.scale)).toBeLessThan(1e-6);
    }
    const fractions = [];
    for (let n = 0; n <= 270; n++) {
      const time = n / 30;
      const camera = evaluateQuickEditCameraAtTime(regions, time);
      const layout = computeQuickEditSceneLayout({
        output: { width: 1904, height: 1064 },
        source: { width: 1904, height: 1064 },
        background: { enabled: false },
        camera,
      });
      expect(layout.videoTransform.x + layout.videoTransform.width / 2).toBeCloseTo(952, 10);
      expect(layout.videoTransform.y + layout.videoTransform.height / 2).toBeCloseTo(532, 10);
      if (time > 3 && time < 6) fractions.push(layout.videoTransform.x);
    }
    expect(new Set(fractions).size).toBe(fractions.length);
    expect(fractions.some((value) => Math.abs(value - Math.round(value)) > 0.1)).toBe(true);
  }
);

it('preserves continuous off-center camera paths in both zoom directions at 30 FPS', () => {
  for (const scales of [
    [1.15, 1.5],
    [1.5, 1.15],
  ]) {
    const regions = [
      region({
        id: 'a',
        start: 0,
        end: 3,
        linkTo: 'b',
        linkEasing: 'linear',
        transform: { scale: scales[0]!, centerX: 0.3, centerY: 0.7 },
      }),
      region({
        id: 'b',
        start: 6,
        end: 9,
        transform: { scale: scales[1]!, centerX: 0.7, centerY: 0.3 },
      }),
    ];
    for (let n = 0; n <= 90; n++) {
      const camera = evaluateQuickEditCameraAtTime(regions, 3 + n / 30);
      const progress = n / 90;
      expect(camera.scale).toBeCloseTo(scales[0]! + (scales[1]! - scales[0]!) * progress, 10);
      const rendered = (transform: typeof camera) =>
        computeQuickEditSceneLayout({
          output: { width: 1904, height: 1064 },
          source: { width: 1904, height: 1064 },
          background: { enabled: false },
          camera: transform,
        }).videoTransform;
      const start = rendered(regions[0]!.transform),
        end = rendered(regions[1]!.transform);
      expect(rendered(camera).x).toBeCloseTo(start.x + (end.x - start.x) * progress, 9);
      expect(rendered(camera).y).toBeCloseTo(start.y + (end.y - start.y) * progress, 9);
    }
  }
});

it('shares inset geometry while retaining Gallery background-enabled and disabled policy', async () => {
  const { insetMediaCanvas } = await import('../../project/window-geometry');
  const { computeQuickEditContentRect } = await import('./scene');
  for (const padding of [0, 12.25, 40, 4096]) {
    const output = { width: 320, height: 180 };
    expect(
      computeQuickEditContentRect(output, {
        enabled: true,
        type: 'solid',
        color: '#123456',
        layout: { padding, cornerRadius: 0 },
      })
    ).toEqual(insetMediaCanvas(output, padding));
    expect(
      computeQuickEditContentRect(output, {
        enabled: false,
        rememberedLayout: { padding, cornerRadius: 0 },
      })
    ).toEqual(insetMediaCanvas(output, 0));
  }
});
