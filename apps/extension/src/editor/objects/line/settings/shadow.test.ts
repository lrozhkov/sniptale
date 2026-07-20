import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { LinePathInstance } from '../types';
import { readLineShadowSettings } from './shadow';

const fallback = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('falls back shadow color through line color and default shadow settings', () => {
  expect(
    readLineShadowSettings(
      { sniptaleLineColor: '#445566' } as unknown as LinePathInstance,
      fallback
    )
  ).toMatchObject({
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#445566',
    shadowDistance: 4,
  });

  expect(readLineShadowSettings({} as unknown as LinePathInstance, fallback).shadowColor).toBe(
    fallback.shadowColor
  );
});
