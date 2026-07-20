import type { VideoCursorDetectionFrame } from './types';
import { getLuma, isInFrame, NEIGHBOR_OFFSETS } from './pixels';

interface CursorPixelParams {
  maxDarkLuma: number;
  minBrightLuma: number;
}

export type CursorLumaMode = 'bright' | 'dark';

export function isBrightPixel(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorPixelParams
): boolean {
  const index = (y * frame.width + x) * 4;
  return frame.data[index + 3]! > 32 && getLuma(frame.data, index) >= params.minBrightLuma;
}

export function isCandidatePixel(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorPixelParams
): boolean {
  return (
    (isBrightPixel(frame, x, y, params) && hasDarkNeighbor(frame, x, y, params.maxDarkLuma)) ||
    (isDarkPixel(frame, x, y, params) && hasBrightNeighbor(frame, x, y, params.minBrightLuma))
  );
}

export function isComponentPixel(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorPixelParams,
  mode: CursorLumaMode
): boolean {
  return mode === 'bright' ? isBrightPixel(frame, x, y, params) : isDarkPixel(frame, x, y, params);
}

export function hasOppositeNeighbor(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorPixelParams,
  mode: CursorLumaMode
): boolean {
  return mode === 'bright'
    ? hasDarkNeighbor(frame, x, y, params.maxDarkLuma)
    : hasBrightNeighbor(frame, x, y, params.minBrightLuma);
}

function isDarkPixel(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorPixelParams
): boolean {
  const index = (y * frame.width + x) * 4;
  return frame.data[index + 3]! > 32 && getLuma(frame.data, index) <= params.maxDarkLuma;
}

function hasDarkNeighbor(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  maxDarkLuma: number
): boolean {
  return hasNeighborMatchingLuma(frame, x, y, (luma) => luma <= maxDarkLuma);
}

function hasBrightNeighbor(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  minBrightLuma: number
): boolean {
  return hasNeighborMatchingLuma(frame, x, y, (luma) => luma >= minBrightLuma);
}

function hasNeighborMatchingLuma(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  matchesLuma: (luma: number) => boolean
): boolean {
  return NEIGHBOR_OFFSETS.some(([offsetX, offsetY]) => {
    const nextX = x + offsetX;
    const nextY = y + offsetY;
    if (!isInFrame(frame, nextX, nextY)) {
      return false;
    }

    const index = (nextY * frame.width + nextX) * 4;
    return frame.data[index + 3]! > 32 && matchesLuma(getLuma(frame.data, index));
  });
}
