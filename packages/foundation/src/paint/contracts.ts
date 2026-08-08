export const PAINT_INTERPOLATION_SPACES = ['srgb', 'srgb-linear', 'oklab', 'oklch'] as const;
export type PaintInterpolationSpace = (typeof PAINT_INTERPOLATION_SPACES)[number];

export interface GradientStop {
  id: string;
  color: string;
  position: number;
  /** Position of the perceptual 50% blend toward the following stop. */
  midpoint: number;
}

export interface GradientRepeat {
  enabled: boolean;
  span: number;
}

interface GradientBase {
  stops: GradientStop[];
  interpolation: PaintInterpolationSpace;
  repeat: GradientRepeat;
}

export interface LinearGradient extends GradientBase {
  type: 'linear';
  angle: number;
}

export interface RadialGradient extends GradientBase {
  type: 'radial';
  center: { x: number; y: number };
  radius: { x: number; y: number };
}

export interface ConicGradient extends GradientBase {
  type: 'conic';
  center: { x: number; y: number };
  startAngle: number;
}

export type Gradient = LinearGradient | RadialGradient | ConicGradient;
export type SolidPaint = { kind: 'solid'; color: string };
export type GradientPaint = { kind: 'gradient'; gradient: Gradient };
export type Paint = SolidPaint | GradientPaint;

export type GradientType = Gradient['type'];
export type PaintStopIdFactory = () => string;

export const MIN_GRADIENT_STOPS = 2;
export const MAX_GRADIENT_STOPS = 16;
