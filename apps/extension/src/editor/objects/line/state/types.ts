import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { LinePoint } from '../types';

export interface LineUpdateOptions {
  settings?: EditorLineSettings;
  points?: LinePoint[];
  closed?: boolean;
}
