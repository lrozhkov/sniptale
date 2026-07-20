import type { VideoCursorDetectionFrame } from './types';

export const NEIGHBOR_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

export function getLuma(data: Uint8ClampedArray, index: number): number {
  return data[index]! * 0.2126 + data[index + 1]! * 0.7152 + data[index + 2]! * 0.0722;
}

export function isInFrame(frame: VideoCursorDetectionFrame, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < frame.width && y < frame.height;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
