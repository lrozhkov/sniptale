export const watermarkAnchors = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

/** Authored final-canvas overlay; the image is retained even while None or Text is selected. */
export interface QuickEditWatermarkSettings {
  mode: 'none' | 'text' | 'image';
  layout: 'single' | 'tiled';
  text: {
    value: string;
    font: 'sans' | 'serif' | 'mono';
    weight: 'normal' | 'bold';
    /** Absent in earlier projects means no strikethrough. */
    strike?: boolean;
    italic?: boolean;
    /** Font size relative to the short canvas side. */
    size: number;
    /** The color is the sole source of text alpha. */
    color: string;
    align: 'left' | 'center' | 'right';
    shadow: boolean;
    /** Width of the wrapping region relative to the canvas width. */
    wrapWidth: number;
  };
  image?: {
    assetId: string;
    width: number;
    height: number;
    /** Width relative to canvas width, further constrained by the available height. */
    size: number;
    opacity: number;
  };
  placement: {
    anchor: (typeof watermarkAnchors)[number];
    /** Edge margin relative to the short canvas side. */
    margin: number;
    /** Optional custom center in normalized canvas coordinates; selecting an anchor removes it. */
    position?: { x: number; y: number };
  };
  tile: {
    /** Gap after rotated painted bounds, relative to the short canvas side; minimum one pixel. */
    spacing: number;
    rotation: number;
  };
}
