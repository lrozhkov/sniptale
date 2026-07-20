import type { Textbox } from 'fabric';
import type { normalizeTextCalloutFormat } from '../interaction';
import type { normalizeTextLayoutMode } from '../mode';

export type LayoutTextbox = Textbox & {
  calcTextWidth?: () => number;
  canvas?: import('fabric').Canvas | null;
  on?: (eventName: string, handler: () => void) => void;
  set?: (patch: Record<string, unknown>) => void;
};

export type TextCalloutFormat = ReturnType<typeof normalizeTextCalloutFormat>;
export type TextLayoutMode = ReturnType<typeof normalizeTextLayoutMode>;

export interface TextLayoutOptions {
  layoutMode: TextLayoutMode;
  surfaceHeight?: number | undefined;
  surfaceWidth?: number | undefined;
}
