import type { Paint } from '@sniptale/foundation/paint';

export type SurfaceStyle = {
  fillPaint: Paint;
  surfaceCss: string;
};

export type SurfaceStylePreset = {
  id: string;
  name: string;
  origin: 'system' | 'user';
  style: SurfaceStyle;
};
