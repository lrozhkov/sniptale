import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { LinePathInstance } from '../types';
import { readLineRoughFillSettings } from './rough-fill';

const fallback = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('reads rough fill metadata and falls back through fill and texture settings', () => {
  const settings = readLineRoughFillSettings(
    {
      sniptaleLineFillColor: '#8899aa',
      sniptaleLineSettings: {
        fillOpacity: 0.45,
        roughFillAngle: 30,
        roughFillBowing: 1.5,
        roughFillGap: 8,
        roughFillRoughness: 2.5,
        roughFillStyle: 'zigzag',
        roughFillWeight: 3,
      },
    } as unknown as LinePathInstance,
    fallback
  );

  expect(settings).toEqual({
    roughFillAngle: 30,
    roughFillBowing: 1.5,
    roughFillColor: '#8899aa',
    roughFillGap: 8,
    roughFillOpacity: 0.45,
    roughFillRoughness: 2.5,
    roughFillStyle: 'zigzag',
    roughFillWeight: 3,
  });
});
