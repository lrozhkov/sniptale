import { describe, expect, it } from 'vitest';
import { createModeledFreehandStroke } from './modeling';
import { resolveArrowCandidate, resolveLineCandidate } from './open-fit';

function registerLineCandidateTest() {
  it('accepts direct strokes as lines and rejects jagged open polylines', () => {
    const directStroke = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 20, y: 2 },
      { x: 42, y: 1 },
      { x: 64, y: 2 },
      { x: 88, y: 0 },
    ]);
    const jaggedStroke = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 22, y: 12 },
      { x: 48, y: -2 },
      { x: 76, y: 22 },
      { x: 104, y: 16 },
    ]);

    expect(resolveLineCandidate(directStroke!)).toMatchObject({
      confidence: expect.any(Number),
      kind: 'line',
    });
    expect(resolveLineCandidate(jaggedStroke!)).toBeNull();
  });
}

function registerArrowCandidateTest() {
  it('recognizes repeated-tip arrows and rejects short open strokes', () => {
    const repeatedTipArrow = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 48, y: 2 },
      { x: 72, y: 0 },
      { x: 96, y: 0 },
      { x: 74, y: -18 },
      { x: 96, y: 0 },
      { x: 72, y: 18 },
    ]);
    const userArrow = createModeledFreehandStroke([
      { x: 2, y: 34 },
      { x: 18, y: 32 },
      { x: 36, y: 28 },
      { x: 54, y: 24 },
      { x: 72, y: 20 },
      { x: 90, y: 16 },
      { x: 106, y: 12 },
      { x: 92, y: 0 },
      { x: 106, y: 12 },
      { x: 88, y: 22 },
    ]);
    const shortStroke = createModeledFreehandStroke([
      { x: 0, y: 0 },
      { x: 18, y: 0 },
      { x: 30, y: -10 },
      { x: 42, y: 0 },
    ]);

    expect(resolveArrowCandidate(repeatedTipArrow!)).toMatchObject({
      confidence: expect.any(Number),
      kind: 'arrow',
    });
    expect(resolveArrowCandidate(userArrow!)).toMatchObject({
      confidence: expect.any(Number),
      kind: 'arrow',
    });
    expect(resolveArrowCandidate(shortStroke!)).toBeNull();
  });
}

describe('editor-controller freehand open-fit seam', () => {
  registerLineCandidateTest();
  registerArrowCandidateTest();
});
