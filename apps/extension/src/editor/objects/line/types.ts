import type { Path } from 'fabric';
import type { EditorLineSettings } from '../../../features/editor/document/line-types';

export interface LinePoint {
  x: number;
  y: number;
}

export interface LineObjectOptions {
  id: string;
  labelIndex: number;
  label?: string;
  points: LinePoint[];
  closed?: boolean;
  settings: EditorLineSettings;
}

export type LinePathInstance = Path & {
  sniptaleLineClosed: boolean;
  sniptaleLinePoints: LinePoint[];
  sniptaleLineSettings: EditorLineSettings;
};
