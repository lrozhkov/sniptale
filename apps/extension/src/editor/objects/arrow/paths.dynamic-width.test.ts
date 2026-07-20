import { describe, expect, it } from 'vitest';

import { buildArrowPathData } from './paths';

function extractClosedSubpaths(path: string): string[] {
  return path
    .split('Z')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getTopologySignature(path: string): string {
  return [
    `moves:${path.split('M').length - 1}`,
    `lines:${path.split('L').length - 1}`,
    `closed:${path.split('Z').length - 1}`,
  ].join('|');
}

describe('object-factory arrow dynamic-width path', () => {
  it('keeps dynamic width on the standard arrow path with configured heads', () => {
    const baseSettings = {
      color: '#f60',
      dynamicWidth: false,
      endHead: 'triangle',
      mode: 'straight',
      opacity: 1,
      startHead: 'circle',
      variant: 'standard',
      width: 8,
    };
    const points = [
      { x: 0, y: 0 },
      { x: 72, y: 0 },
    ];
    const standardPath = buildArrowPathData(points, baseSettings as never);
    const dynamicPath = buildArrowPathData(points, {
      ...baseSettings,
      dynamicWidth: true,
    } as never);

    expect(extractClosedSubpaths(dynamicPath)).toHaveLength(3);
    expect(dynamicPath).not.toBe(standardPath);
    expect(getTopologySignature(dynamicPath)).toBe(getTopologySignature(standardPath));
  });
});
