import type { BorderPreset } from '../../highlighter/contracts';
import type { EditorGradientColorStop } from './gradient';

export type EditorLineStyle = 'solid' | 'dash' | 'dot' | 'dash-dot' | 'long-dash';
export type EditorLineCornerStyle = 'round' | 'sharp';
export type EditorLineFillMode = 'none' | 'color' | 'gradient' | 'rough';
export type EditorLineRoughFillStyle =
  | 'hachure'
  | 'solid'
  | 'zigzag'
  | 'cross-hatch'
  | 'dots'
  | 'dashed'
  | 'zigzag-line';

export interface EditorLineSettings {
  color: string;
  width: number;
  style: EditorLineStyle;
  corners: EditorLineCornerStyle;
  roughness: number;
  bowing?: number;
  opacity: number;
  shadow: BorderPreset['shadow'];
  shadowAngle?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDistance?: number;
  fillMode: EditorLineFillMode;
  fillColor: string;
  fillOpacity: number;
  gradientFrom: string;
  gradientTo: string;
  gradientStops?: EditorGradientColorStop[] | undefined;
  gradientAngle: number;
  roughFillStyle: EditorLineRoughFillStyle;
  roughFillColor: string;
  roughFillGap: number;
  roughFillAngle: number;
  roughFillWeight: number;
  roughFillRoughness: number;
  roughFillBowing: number;
  roughFillOpacity: number;
}
