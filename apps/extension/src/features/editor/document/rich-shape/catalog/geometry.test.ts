import { describe, expect, it } from 'vitest';

import { getEditorBuiltInShapeEntry } from './index';
import type { EditorBuiltInShapeGeometryDefinition } from './index';

function getRequiredGeometry(id: string): EditorBuiltInShapeGeometryDefinition {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry.geometry;
}

function getTextFrame(id: string) {
  const frame = getRequiredGeometry(id).textFrame;
  if (!frame) {
    throw new Error(`Missing text frame for ${id}`);
  }
  return frame;
}

function collectGeometryPoints(
  geometry: EditorBuiltInShapeGeometryDefinition
): Array<readonly [number, number]> {
  if (geometry.type === 'polyline') {
    return [...geometry.points];
  }

  return geometry.paths.flatMap((path) =>
    path.commands.flatMap((command): Array<readonly [number, number]> => {
      switch (command[0]) {
        case 'M':
        case 'L':
          return [[command[1], command[2]]];
        case 'Q':
          return [
            [command[1], command[2]],
            [command[3], command[4]],
          ];
        case 'C':
          return [
            [command[1], command[2]],
            [command[3], command[4]],
            [command[5], command[6]],
          ];
        case 'A':
          return [[command[6], command[7]]];
        case 'Z':
          return [];
      }
    })
  );
}

function getGeometryBounds(geometry: EditorBuiltInShapeGeometryDefinition) {
  const points = collectGeometryPoints(geometry);
  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);

  return {
    maxX: Math.max(...xValues),
    maxY: Math.max(...yValues),
    minX: Math.min(...xValues),
    minY: Math.min(...yValues),
  };
}

describe('built-in rich shape catalog geometry', () => {
  it('uses canonical geometry for entries that previously borrowed unrelated shapes', () => {
    expect(getRequiredGeometry('flowchart-manual-input')).not.toEqual(
      getRequiredGeometry('trapezoid')
    );
    expect(getRequiredGeometry('flowchart-display')).not.toEqual(getRequiredGeometry('chevron'));
    expect(getRequiredGeometry('flowchart-delay')).not.toEqual(getRequiredGeometry('chord'));
    expect(getRequiredGeometry('striped-right-arrow')).not.toEqual(
      getRequiredGeometry('right-arrow')
    );
    expect(getRequiredGeometry('left-right-chevron')).not.toEqual(getRequiredGeometry('chevron'));
    expect(getRequiredGeometry('math-divide')).not.toEqual(getRequiredGeometry('oval'));
  });

  it('keeps non-rectangular text frames inside their intended body area', () => {
    expect(getTextFrame('left-bracket')).toEqual({ height: 68, left: 30, top: 16, width: 58 });
    expect(getTextFrame('right-bracket')).toEqual({ height: 68, left: 12, top: 16, width: 58 });
    expect(getTextFrame('left-brace')).toEqual({ height: 72, left: 38, top: 14, width: 50 });
    expect(getTextFrame('right-brace')).toEqual({ height: 72, left: 12, top: 14, width: 50 });
    expect(getTextFrame('pie')).toEqual({ height: 34, left: 30, top: 46, width: 48 });
    expect(getTextFrame('chord')).toEqual({ height: 30, left: 18, top: 62, width: 64 });
    expect(getTextFrame('flowchart-delay')).toEqual({ height: 64, left: 10, top: 18, width: 64 });
    expect(getTextFrame('rect-callout')).toEqual({ height: 46, left: 16, top: 18, width: 68 });
    expect(getTextFrame('cloud-callout')).toEqual({ height: 38, left: 24, top: 38, width: 56 });
  });
});

describe('built-in flowchart geometry', () => {
  it('keeps flowchart text frames aligned with their canonical symbol bodies', () => {
    expect(getTextFrame('flowchart-manual-input')).toEqual({
      height: 52,
      left: 16,
      top: 28,
      width: 70,
    });
    expect(getTextFrame('flowchart-display')).toEqual({
      height: 56,
      left: 20,
      top: 22,
      width: 58,
    });
  });

  it('keeps repaired sector-style shapes using broad visual frame bounds', () => {
    ['pie', 'chord', 'flowchart-delay'].forEach((id) => {
      expect(getGeometryBounds(getRequiredGeometry(id))).toEqual({
        maxX: 100,
        maxY: 100,
        minX: 0,
        minY: 0,
      });
    });
  });
});
