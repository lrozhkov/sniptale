import { describe, expect, it } from 'vitest';
import { createModeledFreehandStroke } from './modeling';
import { resolveQuadCandidate } from './quad-fit';

function registerRectangleAndSquareTest() {
  it('recognizes rectangles and squares from stable quad corners', () => {
    const modeledStroke = createModeledFreehandStroke([
      { x: 14, y: 8 },
      { x: 72, y: 8 },
      { x: 72, y: 42 },
      { x: 14, y: 42 },
      { x: 14, y: 8 },
    ]);

    expect(
      resolveQuadCandidate({
        corners: modeledStroke!.centerline,
        modeledStroke: modeledStroke!,
        sharpness: 0.8,
      })
    ).toMatchObject({
      confidence: expect.any(Number),
      kind: 'rectangle',
    });

    const modeledSquare = createModeledFreehandStroke([
      { x: 16, y: 16 },
      { x: 48, y: 16 },
      { x: 48, y: 48 },
      { x: 16, y: 48 },
      { x: 16, y: 16 },
    ]);
    expect(
      resolveQuadCandidate({
        corners: modeledSquare!.centerline,
        modeledStroke: modeledSquare!,
        sharpness: 0.8,
      })
    ).toMatchObject({
      isSquare: true,
      kind: 'rectangle',
    });
  });
}

function registerBorderlineSquareTest() {
  it('keeps slightly uneven user-like squares on the square side of the cutoff', () => {
    const borderlineSquare = createModeledFreehandStroke([
      { x: 10, y: 8 },
      { x: 54, y: 10 },
      { x: 52, y: 48 },
      { x: 8, y: 46 },
      { x: 10, y: 8 },
    ]);
    expect(
      resolveQuadCandidate({
        corners: borderlineSquare!.centerline,
        modeledStroke: borderlineSquare!,
        sharpness: 0.72,
      })
    ).toMatchObject({
      isSquare: true,
      kind: 'rectangle',
    });
  });
}

function registerDiamondAndNoiseTest() {
  it('recognizes diamonds and rejects noisy quads', () => {
    const modeledDiamond = createModeledFreehandStroke([
      { x: 30, y: 0 },
      { x: 72, y: 22 },
      { x: 42, y: 60 },
      { x: 0, y: 38 },
      { x: 30, y: 0 },
    ]);

    expect(
      resolveQuadCandidate({
        corners: modeledDiamond!.centerline,
        modeledStroke: modeledDiamond!,
        sharpness: 0.74,
      })
    ).toMatchObject({
      confidence: expect.any(Number),
      kind: 'diamond',
    });

    const noisyStroke = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 24, y: 8 },
      { x: 42, y: 22 },
      { x: 18, y: 44 },
      { x: 0, y: 0 },
    ]);
    expect(
      resolveQuadCandidate({
        corners: noisyStroke!.centerline,
        modeledStroke: noisyStroke!,
        sharpness: 0.45,
      })
    ).toBeNull();
  });
}

function registerDegenerateQuadTest() {
  it('rejects degenerate quad corners without producing invalid geometry', () => {
    const modeledStroke = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ]);

    expect(
      resolveQuadCandidate({
        corners: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        modeledStroke: modeledStroke!,
        sharpness: 0,
      })
    ).toBeNull();
  });
}

describe('editor-controller freehand quad-fit seam', () => {
  registerRectangleAndSquareTest();
  registerBorderlineSquareTest();
  registerDiamondAndNoiseTest();
  registerDegenerateQuadTest();
});
