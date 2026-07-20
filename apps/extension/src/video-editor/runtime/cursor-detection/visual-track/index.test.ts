import { expect, it } from 'vitest';
import {
  createVisualCursorTrackBuilder,
  detectCursorCandidate,
  detectVisualCursorTrack,
} from './index';
import { detectCursorMotionCandidates } from './motion';
import { cleanVisualCursorTrackSamples } from './trajectory';
import { resolveDetectionRegion, resolveStaticPenalty } from './detector-guards';
import type { VideoCursorDetectionFrame } from './types';

it('detects a high-contrast white cursor candidate from pixels', () => {
  const frame = createFrameWithCursor(0, 12, 10);

  expect(detectCursorCandidate(frame)).toEqual(
    expect.objectContaining({
      confidence: expect.any(Number),
      height: expect.any(Number),
      time: 0,
      width: expect.any(Number),
      x: 12,
      y: 10,
    })
  );
});

it('builds a smoothed visual cursor object track from decoded frames', () => {
  const track = detectVisualCursorTrack(
    [createFrameWithCursor(0, 10, 10), createFrameWithCursor(0.5, 30, 20)],
    { smoothing: 0.5 }
  );

  expect(track).toEqual(
    expect.objectContaining({
      detectorVersion: 'sniptale-visual-cursor-v3',
      hidden: true,
      id: 'visualCursor',
      kind: 'visualCursor',
      role: 'cameraCursor',
      source: 'visualDetection',
    })
  );
  expect(track.samples).toEqual([
    expect.objectContaining({ confidence: expect.any(Number), time: 0, visible: true, x: 10 }),
    expect.objectContaining({ time: 0.5, visible: true, x: 20, y: 15 }),
  ]);
});

it('streams decoded cursor frames without changing the detected track shape', () => {
  const frames = [createFrameWithCursor(0, 10, 10), createFrameWithCursor(0.5, 30, 20)];
  const expectedTrack = detectVisualCursorTrack(frames, { smoothing: 0.5 });
  const builder = createVisualCursorTrackBuilder({ smoothing: 0.5 });

  for (const frame of frames) {
    builder.addFrame(frame);
  }

  expect(builder.toTrack()).toEqual(expectedTrack);
});

it('marks missing cursor frames as low-confidence samples that hold the previous position', () => {
  const track = detectVisualCursorTrack([createFrameWithCursor(0, 10, 10), createBlankFrame(0.5)]);

  expect(track.samples[1]).toEqual(
    expect.objectContaining({ confidence: 0, time: 0.5, visible: false, x: 10, y: 10 })
  );
});

it('lets manual anchors override pixel candidates at matching timestamps', () => {
  const track = detectVisualCursorTrack([createFrameWithCursor(0, 10, 10)], {
    manualAnchors: [{ confidence: 0.95, height: 9, time: 0, width: 7, x: 40, y: 22 }],
  });

  expect(track.samples[0]).toEqual(
    expect.objectContaining({ confidence: 0.95, height: 9, visible: true, width: 7, x: 40, y: 22 })
  );
});

it('does not lock onto a static top chrome glyph when a cursor moves in the page', () => {
  const frames = [
    createFrameWithStaticGlyphAndDarkCursor(0, 10, 32),
    createFrameWithStaticGlyphAndDarkCursor(0.125, 20, 32),
    createFrameWithStaticGlyphAndDarkCursor(0.25, 30, 32),
    createFrameWithStaticGlyphAndDarkCursor(0.375, 40, 32),
  ];

  const track = detectVisualCursorTrack(frames);

  expect(track.samples.some((sample) => sample.visible)).toBe(true);
  expect(track.samples.filter((sample) => sample.visible)).toEqual(
    expect.not.arrayContaining([expect.objectContaining({ x: expect.closeTo(56, 4), y: 5 })])
  );
});

it('uses a nearby manual anchor as an acquisition seed beyond the exact anchor time', () => {
  const track = detectVisualCursorTrack(
    [
      createFrameWithStaticGlyphAndDarkCursor(0, 10, 32),
      createFrameWithStaticGlyphAndDarkCursor(0.5, 24, 32),
    ],
    { manualAnchors: [{ time: 0.35, x: 24, y: 32 }] }
  );

  expect(track.samples.some((sample) => sample.visible && sample.x < 40 && sample.y > 20)).toBe(
    true
  );
});

it('holds a motion-backed cursor briefly when it becomes stationary', () => {
  const track = detectVisualCursorTrack([
    createFrameWithStaticGlyphAndDarkCursor(0, 10, 32),
    createFrameWithStaticGlyphAndDarkCursor(0.125, 20, 32),
    createFrameWithStaticGlyphAndDarkCursor(0.25, 30, 32),
    createFrameWithStaticGlyphAndDarkCursor(0.375, 30, 32),
  ]);

  expect(track.samples[2]).toEqual(
    expect.objectContaining({ visible: true, x: expect.any(Number) })
  );
  expect(track.samples[3]).toEqual(
    expect.objectContaining({ visible: true, x: expect.any(Number) })
  );
});

it('rejects oversized motion components without dropping separate bounded cursor motion', () => {
  const previousFrame = createBlankFrame(0, 96, 64);
  const frame = createBlankFrame(0.125, 96, 64);
  drawMotionBlock(frame, 0, 2, 60, 8);
  drawMotionBlock(frame, 80, 20, 3, 3);

  expect(detectCursorMotionCandidates(previousFrame, frame)).toEqual([
    expect.objectContaining({
      area: 9,
      bounds: { height: 3, width: 3, x: 80, y: 20 },
      source: 'motion',
    }),
  ]);
});

it('clamps detection regions and penalizes tiny symmetric glyphs without a top-strip rule', () => {
  const frame = createBlankFrame(0);

  expect(resolveDetectionRegion(frame, { height: 80, width: 80, x: -10, y: -5 })).toEqual({
    height: 48,
    width: 64,
    x: 0,
    y: 0,
  });
  expect(resolveStaticPenalty(frame, { maxX: 62, minX: 55, minY: 20 }, 8, 8)).toBeLessThan(1);
  expect(resolveStaticPenalty(frame, { maxX: 30, minX: 20, minY: 0 }, 14, 18)).toBe(1);
});

it('marks an isolated bounce-back jump invisible before returning the track', () => {
  const samples = cleanVisualCursorTrackSamples([
    { confidence: 1, time: 0, visible: true, x: 10, y: 10 },
    { confidence: 1, time: 1, visible: true, x: 360, y: 240 },
    { confidence: 1, time: 2, visible: true, x: 12, y: 12 },
  ]);

  expect(samples[1]).toEqual(expect.objectContaining({ visible: false }));
});

it('keeps a directed fast movement when it is not a bounce-back', () => {
  const samples = cleanVisualCursorTrackSamples([
    { confidence: 1, time: 0, visible: true, x: 10, y: 10 },
    { confidence: 1, time: 1, visible: true, x: 220, y: 120 },
    { confidence: 1, time: 2, visible: true, x: 390, y: 220 },
  ]);

  expect(samples[1]).toEqual(expect.objectContaining({ visible: true }));
});

it('summarizes coarse camera cursor track quality', () => {
  const track = detectVisualCursorTrack(
    [createFrameWithCursor(0, 10, 10), createFrameWithCursor(1, 30, 18)],
    { minConfidence: 0.3, smoothing: 0 }
  );

  expect(track.analysis?.quality).toEqual(
    expect.objectContaining({ status: 'usable', visibleSamples: 2 })
  );
});

function createBlankFrame(time: number, width = 64, height = 48): VideoCursorDetectionFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  fillFrame(data, 142);
  return { data, height, time, width };
}

function createFrameWithCursor(time: number, cursorX: number, cursorY: number) {
  const frame = createBlankFrame(time);
  drawCursor(frame, cursorX, cursorY);
  return frame;
}

function createFrameWithStaticGlyphAndDarkCursor(
  time: number,
  cursorX: number,
  cursorY: number
): VideoCursorDetectionFrame {
  const frame = createBlankFrame(time);
  drawWindowGlyph(frame, 56, 4);
  drawDarkCursor(frame, cursorX, cursorY);
  return frame;
}

function drawCursor(frame: VideoCursorDetectionFrame, cursorX: number, cursorY: number): void {
  const whitePixels = [
    [0, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
    [1, 3],
    [0, 4],
  ] as const;

  for (const [x, y] of whitePixels) {
    writePixel(frame, cursorX + x, cursorY + y, 255);
  }
  for (let y = -1; y <= 5; y += 1) {
    writePixel(frame, cursorX - 1, cursorY + y, 18);
    writePixel(frame, cursorX + y + 1, cursorY + y, 18);
  }
}

function drawDarkCursor(frame: VideoCursorDetectionFrame, cursorX: number, cursorY: number): void {
  const darkPixels = [
    [0, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
    [1, 3],
    [0, 4],
  ] as const;

  for (const [x, y] of darkPixels) {
    writePixel(frame, cursorX + x, cursorY + y, 38);
  }
}

function drawWindowGlyph(frame: VideoCursorDetectionFrame, x: number, y: number): void {
  for (let offset = 0; offset < 8; offset += 1) {
    writePixel(frame, x + offset, y, 255);
    writePixel(frame, x + offset, y + 7, 255);
    writePixel(frame, x, y + offset, 255);
    writePixel(frame, x + 7, y + offset, 255);
  }
}

function drawMotionBlock(
  frame: VideoCursorDetectionFrame,
  startX: number,
  startY: number,
  width: number,
  height: number
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(frame, x, y, 255);
    }
  }
}

function fillFrame(data: Uint8ClampedArray, value: number): void {
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
}

function writePixel(frame: VideoCursorDetectionFrame, x: number, y: number, value: number): void {
  const index = (y * frame.width + x) * 4;
  frame.data[index] = value;
  frame.data[index + 1] = value;
  frame.data[index + 2] = value;
  frame.data[index + 3] = 255;
}
