import { describe, expect, it } from 'vitest';
import {
  collectDrawingDimensionCandidates,
  collectDrawingGapCandidates,
  verifyDrawingDimensionCandidate,
  verifyDrawingGapCandidate,
  type DrawingDimensionGeometry,
  type DrawingGapCandidate,
  type DrawingRelationBox,
} from './alignment-relations';

const box = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): DrawingRelationBox => ({ id, bounds: { x, y, width, height } });
const transpose = (value: DrawingRelationBox): DrawingRelationBox =>
  box(value.id, value.bounds.y, value.bounds.x, value.bounds.height, value.bounds.width);
function candidate(
  source: DrawingRelationBox,
  targets: readonly DrawingRelationBox[],
  axis: 'x' | 'y',
  mode: DrawingGapCandidate['mode'],
  placement: DrawingGapCandidate['placement']
) {
  const found = collectDrawingGapCandidates({ source, targets }).find(
    (value) =>
      value.axis === axis &&
      value.mode === mode &&
      value.placement === placement &&
      value.referenceIds.join(',') === 'A,B'
  );
  expect(found).toBeDefined();
  return found!;
}
function dimension(
  id: string,
  width: number,
  height?: number,
  x = 0,
  y = 0
): DrawingDimensionGeometry {
  return {
    id,
    width: { value: width, from: { x, y }, to: { x: x + width, y } },
    ...(height === undefined
      ? {}
      : { height: { value: height, from: { x, y }, to: { x, y: y + height } } }),
  };
}

describe('drawing equal-gap relations', () => {
  it.each(['x', 'y'] as const)(
    'centers unequal widths along %s and verifies actual spans',
    (axis) => {
      const convert = axis === 'x' ? (value: DrawingRelationBox) => value : transpose;
      const source = convert(box('S', 35, 5, 40, 10));
      const targets = [convert(box('A', 0, 0, 20, 20)), convert(box('B', 100, 0, 30, 20))];
      const proposal = candidate(source, targets, axis, 'center', 'between');
      expect(proposal.delta).toBe(5);
      expect(proposal.value).toBe(20);
      expect(verifyDrawingGapCandidate({ candidate: proposal, source, targets })).toBeNull();
      const relation = verifyDrawingGapCandidate({
        candidate: proposal,
        source: convert(box('S', 40, 5, 40, 10)),
        targets,
      });
      expect(relation?.spans).toEqual(
        axis === 'x'
          ? [
              { from: { x: 20, y: 10 }, to: { x: 40, y: 10 }, participantIds: ['A', 'S'] },
              { from: { x: 80, y: 10 }, to: { x: 100, y: 10 }, participantIds: ['S', 'B'] },
            ]
          : [
              { from: { x: 10, y: 20 }, to: { x: 10, y: 40 }, participantIds: ['A', 'S'] },
              { from: { x: 10, y: 80 }, to: { x: 10, y: 100 }, participantIds: ['S', 'B'] },
            ]
      );
    }
  );

  it.each(['x', 'y'] as const)('repeats a positive gap on either side along %s', (axis) => {
    const convert = axis === 'x' ? (value: DrawingRelationBox) => value : transpose;
    const targets = [convert(box('A', 0, 0, 20, 20)), convert(box('B', 40, 0, 30, 20))];
    const after = candidate(convert(box('S', 86, 5, 30, 10)), targets, axis, 'repeat', 'after');
    const before = candidate(convert(box('S', -47, 5, 30, 10)), targets, axis, 'repeat', 'before');
    expect(after.delta).toBe(4);
    expect(before.delta).toBe(-3);
    for (const [proposal, source] of [
      [after, convert(box('S', 90, 5, 30, 10))],
      [before, convert(box('S', -50, 5, 30, 10))],
    ] as const) {
      const relation = verifyDrawingGapCandidate({ candidate: proposal, source, targets });
      expect(relation?.value).toBe(20);
      expect(relation?.spans).toHaveLength(2);
      expect(relation).not.toHaveProperty('coordinate');
    }
  });

  it('rejects touching, overlap, insufficient free space and incompatible rows', () => {
    const source = box('S', 35, 5, 40, 10);
    for (const x of [20, 10, 60]) {
      const targets = [box('A', 0, 0, 20, 20), box('B', x, 0, 30, 20)];
      expect(
        collectDrawingGapCandidates({ source, targets }).filter((value) => value.mode === 'center')
      ).toEqual([]);
    }
    expect(
      collectDrawingGapCandidates({
        source: box('S', 35, 100, 40, 10),
        targets: [box('A', 0, 0, 20, 20), box('B', 100, 0, 30, 20)],
      })
    ).toEqual([]);
    const staggered = [box('A', 0, 0, 20, 10), box('B', 40, 8, 20, 10)];
    expect(
      collectDrawingGapCandidates({ source: box('S', 70, 16, 20, 10), targets: staggered })
    ).toEqual([]);
  });

  it('rejects intervening neighbors and occupied repeat destinations', () => {
    const source = box('S', 86, 5, 30, 10);
    const targets = [box('A', 0, 0, 20, 20), box('B', 40, 0, 30, 20)];
    const proposal = candidate(source, targets, 'x', 'repeat', 'after');
    for (const blocker of [
      box('C', 80, 5, 5, 10),
      box('C', 90, 5, 30, 10),
      box('C', 25, 5, 5, 10),
    ]) {
      const blocked = [...targets, blocker];
      expect(
        collectDrawingGapCandidates({ source, targets: blocked }).some(
          (value) => value.key === proposal.key
        )
      ).toBe(false);
      expect(
        verifyDrawingGapCandidate({
          candidate: proposal,
          source: box('S', 90, 5, 30, 10),
          targets: blocked,
        })
      ).toBeNull();
    }
  });

  it('retains connected equal gaps with stable participant identities and fresh references', () => {
    const source = box('S', 133, 5, 10, 10);
    const targets = [box('A', 0, 0, 20, 20), box('B', 40, 0, 30, 20), box('C', 90, 0, 20, 20)];
    const proposals = collectDrawingGapCandidates({ source, targets });
    expect(collectDrawingGapCandidates({ source, targets: [...targets].reverse() })).toEqual(
      proposals
    );
    const proposal = proposals.find(
      (value) =>
        value.axis === 'x' &&
        value.placement === 'after' &&
        value.referenceIds[0] === 'B' &&
        value.referenceIds[1] === 'C'
    )!;
    expect(proposal.delta).toBe(-3);
    const finalSource = box('S', 130, 5, 10, 10);
    const relation = verifyDrawingGapCandidate({
      candidate: proposal,
      source: finalSource,
      targets,
    });
    expect(relation?.spans.map((span) => span.participantIds)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'S'],
    ]);
    expect(
      verifyDrawingGapCandidate({
        candidate: proposal,
        source: finalSource,
        targets: targets.slice(0, 2),
      })
    ).toBeNull();
    expect(
      verifyDrawingGapCandidate({
        candidate: proposal,
        source: { ...finalSource, id: 'other' },
        targets,
      })
    ).toBeNull();
  });

  it('preserves adjacency in separate bands of a tall source', () => {
    const targets = [box('A', 0, 0, 20, 20), box('B', 100, 0, 20, 20), box('C', 50, 80, 20, 20)];
    const source = box('S', 40, 0, 20, 100);
    expect(candidate(source, targets, 'x', 'center', 'between').referenceIds).toEqual(['A', 'B']);
  });
});

describe('drawing dimension relations', () => {
  it('does not prefilter a centered resize by its larger size delta', () => {
    const source = dimension('S', 80);
    const targets = [
      dimension('A', 92, undefined, 1000, 2000),
      dimension('B', 92.02, undefined, 2000, 3000),
    ];
    const candidates = collectDrawingDimensionCandidates({ source, targets });
    expect(candidates.map((value) => value.value)).toEqual([92, 92.02]);
    expect((candidates[0]!.value - 80) / 2).toBe(6);
    expect((candidates[1]!.value - 80) / 2).toBeCloseTo(6.01);
    expect(collectDrawingDimensionCandidates({ source, targets: [...targets].reverse() })).toEqual(
      candidates
    );
  });

  it('verifies independent final width and height with all actual matching spans', () => {
    const source = dimension('S', 80, 30);
    const targets = [dimension('A', 92, 50, 100, 200), dimension('B', 92, 50, 900, 500)];
    const proposals = collectDrawingDimensionCandidates({ source, targets });
    const width = proposals.find(
      (value) => value.dimension === 'width' && value.referenceId === 'A'
    )!;
    const height = proposals.find(
      (value) => value.dimension === 'height' && value.referenceId === 'B'
    )!;
    expect(verifyDrawingDimensionCandidate({ candidate: width, source, targets })).toBeNull();
    const finalSource = dimension('S', 92, 50);
    for (const proposal of [width, height]) {
      const relation = verifyDrawingDimensionCandidate({
        candidate: proposal,
        source: finalSource,
        targets,
      });
      expect(relation?.targetSpans.map((span) => span.participantIds)).toEqual([['A'], ['B']]);
      const measured = finalSource[proposal.dimension]!;
      expect(relation?.sourceSpan).toEqual({
        from: measured.from,
        to: measured.to,
        participantIds: ['S'],
      });
    }
  });

  it('keeps real rotated measurement endpoints instead of inventing an AABB width', () => {
    const measurement = {
      value: 92,
      from: { x: 7, y: 11 },
      to: { x: 7 + 92 / Math.SQRT2, y: 11 + 92 / Math.SQRT2 },
    };
    const source = { id: 'S', width: measurement };
    const targets = [dimension('A', 92, undefined, 300, 500)];
    const proposal = collectDrawingDimensionCandidates({ source, targets })[0]!;
    expect(
      verifyDrawingDimensionCandidate({ candidate: proposal, source, targets })?.sourceSpan
    ).toEqual({ from: measurement.from, to: measurement.to, participantIds: ['S'] });
    expect(
      verifyDrawingDimensionCandidate({ candidate: proposal, source: dimension('S', 90), targets })
    ).toBeNull();
    expect(
      verifyDrawingDimensionCandidate({
        candidate: proposal,
        source: { ...source, id: 'other' },
        targets,
      })
    ).toBeNull();
    expect(
      verifyDrawingDimensionCandidate({ candidate: proposal, source, targets: [] })
    ).toBeNull();
  });

  it('does not mutate inputs and ignores unsupported or invalid measurements', () => {
    const source = Object.freeze({
      id: 'S',
      width: Object.freeze({
        value: 80,
        from: Object.freeze({ x: 0, y: 0 }),
        to: Object.freeze({ x: 80, y: 0 }),
      }),
    });
    const targets = Object.freeze([
      Object.freeze(dimension('A', 92)),
      Object.freeze(dimension('bad', NaN)),
      Object.freeze(dimension('zero', 0)),
      source,
    ]);
    const before = JSON.stringify({ source, targets });
    const candidates = collectDrawingDimensionCandidates({ source, targets });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.referenceId).toBe('A');
    expect(JSON.stringify({ source, targets })).toBe(before);
  });
});

it('keeps gap keys collision-free and does not mutate frozen scene geometry', () => {
  const source = Object.freeze({
    id: 'S:selection',
    bounds: Object.freeze({ x: 35, y: 5, width: 40, height: 10 }),
  });
  const targets = Object.freeze([
    Object.freeze({ id: 'A:B', bounds: Object.freeze({ x: 0, y: 0, width: 20, height: 20 }) }),
    Object.freeze({ id: 'C', bounds: Object.freeze({ x: 100, y: 0, width: 30, height: 20 }) }),
    source,
  ]);
  const before = JSON.stringify({ source, targets });
  const values = collectDrawingGapCandidates({ source, targets });
  expect(collectDrawingGapCandidates({ source, targets: [...targets].reverse() })).toEqual(values);
  const centered = values.find((value) => value.axis === 'x' && value.mode === 'center')!;
  expect(JSON.parse(centered.key)).toEqual([
    'gap',
    'x',
    'center',
    'between',
    'S:selection',
    'A:B',
    'C',
  ]);
  expect(JSON.stringify({ source, targets })).toBe(before);
  const finalSource = { id: source.id, bounds: { ...source.bounds, x: 40 + 0.5e-6 } };
  expect(
    verifyDrawingGapCandidate({ candidate: centered, source: finalSource, targets })
  ).not.toBeNull();
  expect(
    verifyDrawingGapCandidate({
      candidate: centered,
      source: finalSource,
      targets,
      epsilon: 0.1e-6,
    })
  ).toBeNull();
  expect(
    verifyDrawingGapCandidate({
      candidate: centered,
      source: finalSource,
      targets,
      epsilon: Infinity,
    })
  ).toBeNull();
});

it('rejects changed references and invalid final dimension identities or values', () => {
  const source = dimension('S', 80);
  const targets = [dimension('A', 92)];
  const proposal = collectDrawingDimensionCandidates({ source, targets })[0]!;
  expect(
    verifyDrawingDimensionCandidate({
      candidate: proposal,
      source: dimension('S', 92),
      targets: [dimension('A', 93)],
    })
  ).toBeNull();
  expect(
    verifyDrawingDimensionCandidate({
      candidate: { ...proposal, sourceId: '' },
      source: dimension('', 92),
      targets,
    })
  ).toBeNull();
  expect(
    verifyDrawingDimensionCandidate({
      candidate: { ...proposal, value: Infinity },
      source: dimension('S', 92),
      targets,
    })
  ).toBeNull();
  expect(
    verifyDrawingDimensionCandidate({
      candidate: proposal,
      source: dimension('S', 92),
      targets,
      epsilon: Infinity,
    })
  ).toBeNull();
  expect(
    collectDrawingGapCandidates({
      source: box('S', 1e308, 0, 1e308, 10),
      targets: [box('A', 0, 0, 20, 20), box('B', 40, 0, 20, 20)],
    })
  ).toEqual([]);
});
