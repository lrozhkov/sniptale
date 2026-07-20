import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { type EditorLineSettings } from '../../../../features/editor/document/line-types';
import { DEFAULT_BORDER_PRESET } from '../../../../composition/persistence/highlighter';
import type { LinePathInstance } from '../types';
import { readLineFillSettings } from './fill';
import { readLineRoughFillSettings } from './rough-fill';
import { readLineShadowSettings } from './shadow';
import { readLineStrokeSettings } from './stroke';

export function readLineSettings(line: LinePathInstance): EditorLineSettings {
  const fallback = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;
  return {
    ...readLineStrokeSettings(line, fallback),
    ...readLineShadowSettings(line, fallback),
    ...readLineFillSettings(line, fallback),
    ...readLineRoughFillSettings(line, fallback),
  };
}
