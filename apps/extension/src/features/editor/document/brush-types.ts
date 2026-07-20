import type { BorderPreset } from '../../highlighter/contracts';

export const EDITOR_BRUSH_SHAPE_CORRECTION = {
  OFF: 'off',
  SUBTLE: 'subtle',
  STRONG: 'strong',
} as const;

export type EditorBrushShapeCorrectionMode =
  (typeof EDITOR_BRUSH_SHAPE_CORRECTION)[keyof typeof EDITOR_BRUSH_SHAPE_CORRECTION];

export interface EditorBrushSettings {
  color: string;
  dynamicWidth?: boolean;
  width: number;
  opacity: number;
  shadow: BorderPreset['shadow'];
  shadowAngle?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDistance?: number;
  smoothingLevel: number;
  shapeCorrection: EditorBrushShapeCorrectionMode;
}
