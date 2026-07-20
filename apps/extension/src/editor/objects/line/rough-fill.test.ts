// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { Pattern } from 'fabric';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createLineObject } from './';
import { createLineRoughFillPattern } from './rough-fill/pattern';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

describe('line pencil fill rendering', () => {
  it('keeps pencil fill color and opacity on a separate pattern fill', () => {
    const line = createLineObject({
      id: 'line-pencil-fill-opacity',
      labelIndex: 7,
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
      ],
      settings: {
        ...settings,
        fillColor: '#ffffff',
        fillMode: 'rough',
        opacity: 0.25,
        roughFillColor: '#123456',
        roughFillOpacity: 0.5,
        roughFillStyle: 'solid',
      },
      closed: true,
    });

    expect(line.stroke).toBe('rgba(17, 24, 39, 0.25)');
    expect(line.fill).toBeInstanceOf(Pattern);

    const source = (line.fill as Pattern).source as HTMLCanvasElement;
    const context = source.getContext('2d');
    const pixel = context?.getImageData(0, 0, 1, 1).data;
    expect(Array.from(pixel?.slice(0, 3) ?? [])).toEqual([18, 52, 86]);
    const alpha = pixel?.[3] ?? 0;
    expect(alpha).toBeGreaterThanOrEqual(126);
    expect(alpha).toBeLessThanOrEqual(128);
  });

  it('renders every pencil fill pattern style through the shared pattern factory', () => {
    const styles = ['dots', 'dashed', 'zigzag', 'cross-hatch'] as const;

    styles.forEach((roughFillStyle) => {
      expect(
        createLineRoughFillPattern({
          ...settings,
          roughFillColor: '#123456',
          roughFillOpacity: 0.5,
          roughFillStyle,
        })
      ).toBeInstanceOf(Pattern);
    });
  });
});
