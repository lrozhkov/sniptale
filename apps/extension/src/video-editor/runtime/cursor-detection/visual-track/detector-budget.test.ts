import { expect, it } from 'vitest';
import { detectCursorCandidates } from './index';
import type { VideoCursorDetectionFrame } from './types';

it('rejects oversized contrast components without dropping separate bounded cursor pixels', () => {
  const frame = createBlankFrame(0, 128, 128);
  drawFilledRect(frame, 0, 0, 100, 110, 255);
  drawFilledRect(frame, 100, 0, 2, 110, 18);
  drawCursor(frame, 116, 116);

  const candidates = detectCursorCandidates(frame);

  expect(candidates).toHaveLength(2);
  expect(candidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        bounds: expect.objectContaining({ x: 116, y: 116 }),
        source: 'contrast',
        x: 116,
        y: 116,
      }),
    ])
  );
  expect(candidates.every((candidate) => candidate.bounds.x >= 115)).toBe(true);
});

function createBlankFrame(time: number, width: number, height: number): VideoCursorDetectionFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  fillFrame(data, 142);
  return { data, height, time, width };
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

function drawFilledRect(
  frame: VideoCursorDetectionFrame,
  startX: number,
  startY: number,
  width: number,
  height: number,
  value: number
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(frame, x, y, value);
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
