import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { LinePathInstance } from '../types';
import { readLineStrokeSettings } from './stroke';

const fallback = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('reads direct stroke metadata before bundled settings and defaults', () => {
  const line = {
    sniptaleLineBowing: 2,
    sniptaleLineColor: '#abcdef',
    sniptaleLineOpacity: 0.4,
    sniptaleLineSettings: {
      ...fallback,
      color: '#111111',
      corners: 'sharp',
      roughness: 3,
      style: 'dot',
      width: 9,
    },
  } as unknown as LinePathInstance;

  expect(readLineStrokeSettings(line, fallback)).toEqual({
    bowing: 2,
    color: '#abcdef',
    corners: 'sharp',
    opacity: 0.4,
    roughness: 3,
    style: 'dot',
    width: 9,
  });
});
