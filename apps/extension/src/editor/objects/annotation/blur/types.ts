import type { Rect } from 'fabric';

export type BlurRuntimeObject = Rect & {
  sniptaleBlurRenderAttached?: boolean;
  sniptaleBlurBaseRender?: (ctx: CanvasRenderingContext2D) => void;
  sniptaleBlurStrokeColor?: string;
  sniptaleBlurStrokeWidth?: number;
  sniptaleBlurSourceData?: string;
  sniptaleBlurSourceLeft?: number;
  sniptaleBlurSourceTop?: number;
  sniptaleBlurSourceWidth?: number;
  sniptaleBlurSourceHeight?: number;
  sniptaleId?: string;
  sniptaleLabel?: string | null;
};
