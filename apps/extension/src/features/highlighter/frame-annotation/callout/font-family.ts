import type { CalloutFontFamily } from '@sniptale/runtime-contracts/highlighter/callout';

const FRAME_CALLOUT_FONT_FAMILY_MAP: Record<CalloutFontFamily, string> = {
  sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  cursive: '"Sniptale Handwritten", "Segoe Print", "Bradley Hand", cursive',
};

export function resolveFrameCalloutFontFamily(fontFamily: CalloutFontFamily): string {
  return FRAME_CALLOUT_FONT_FAMILY_MAP[fontFamily];
}
