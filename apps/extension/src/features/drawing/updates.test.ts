import { expect, it } from 'vitest';
import { resolveUpdatedQuickObject } from './updates';

it('updates pencil, marker, and arrow properties without dropping geometry', () => {
  expect(
    resolveUpdatedQuickObject(
      { color: '#old', id: 'p', kind: 'pencil', samples: [], width: 2 },
      { color: '#new', width: 6 }
    )
  ).toEqual({ color: '#new', id: 'p', kind: 'pencil', samples: [], width: 6 });
  expect(
    resolveUpdatedQuickObject(
      { color: '#old', id: 'm', kind: 'marker', opacity: 1, samples: [], width: 12 },
      { opacity: 0.4 }
    )
  ).toEqual(expect.objectContaining({ kind: 'marker', opacity: 0.4, width: 12 }));
  expect(
    resolveUpdatedQuickObject(
      {
        color: '#old',
        dynamicWidth: false,
        end: { x: 10, y: 10 },
        id: 'a',
        kind: 'arrow',
        start: { x: 0, y: 0 },
        width: 3,
      },
      { design: 'freehand', dynamicWidth: true }
    )
  ).toEqual(expect.objectContaining({ design: 'freehand', dynamicWidth: true }));
});

it('updates text typography and recomputes its height with and without measurement', () => {
  const text = {
    backgroundColor: null,
    bounds: { height: 30, width: 120, x: 10, y: 20 },
    color: '#111111',
    fontFamily: 'sans' as const,
    fontSize: 16,
    id: 'text',
    kind: 'text' as const,
    text: 'A long line of text',
  };
  const colorOnly = resolveUpdatedQuickObject(text, { color: '#222222' });
  if (colorOnly.kind !== 'text') throw new Error('Expected text update');
  expect(colorOnly.bounds).toBe(text.bounds);

  const measured = resolveUpdatedQuickObject(
    text,
    {
      backgroundColor: '#ffffff80',
      fontFamily: 'handwritten',
      fontSize: 24,
    },
    { measureText: () => 50 }
  );
  if (measured.kind !== 'text') throw new Error('Expected text update');
  expect(measured).toEqual(
    expect.objectContaining({
      backgroundColor: '#ffffff80',
      fontFamily: 'handwritten',
      fontSize: 24,
    })
  );
  expect(measured.bounds.height).toBeGreaterThan(0);

  const fallback = resolveUpdatedQuickObject(text, { fontSize: 18 });
  if (fallback.kind !== 'text') throw new Error('Expected text update');
  expect(fallback.bounds.height).toBeGreaterThan(0);
});

it.each(['rectangle', 'ellipse', 'triangle'] as const)(
  'switches shape geometry to %s while preserving shared style',
  (kind) => {
    const updated = resolveUpdatedQuickObject(
      {
        bounds: { height: 40, width: 80, x: 0, y: 0 },
        color: '#old',
        fillColor: null,
        id: 'shape',
        kind: 'rectangle',
        width: 2,
      },
      { color: '#new', fillColor: '#ffffff', kind, width: 5 }
    );
    expect(updated).toEqual(
      expect.objectContaining({ color: '#new', fillColor: '#ffffff', kind, width: 5 })
    );
  }
);
