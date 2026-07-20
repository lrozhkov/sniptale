import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { LinePathInstance } from '../types';
import { readLineFillSettings } from './fill';

const fallback = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('normalizes fill metadata and creates gradient fallback stops', () => {
  const settings = readLineFillSettings(
    {
      sniptaleLineFillColor: '#fedcba',
      sniptaleLineFillMode: 'gradient',
      sniptaleLineFillOpacity: 0.5,
      sniptaleLineGradientAngle: 45,
      sniptaleLineGradientFrom: '#111111',
      sniptaleLineGradientTo: '#222222',
    } as unknown as LinePathInstance,
    fallback
  );

  expect(settings).toMatchObject({
    fillColor: '#fedcba',
    fillMode: 'gradient',
    fillOpacity: 0.5,
    gradientAngle: 45,
    gradientFrom: '#111111',
    gradientTo: '#222222',
  });
  expect(settings.gradientStops).toEqual([
    { color: '#111111', offset: 0 },
    { color: '#222222', offset: 1 },
  ]);
});
