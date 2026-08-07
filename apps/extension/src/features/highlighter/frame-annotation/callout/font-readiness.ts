import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

export const FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD = '400 16px "Sniptale Handwritten"';
const FRAME_CALLOUT_FONT_PROBE_TEXT = 'AaБб';

export function requiresFrameCalloutHandwrittenFont(
  callout: CalloutSettings | undefined
): callout is CalloutSettings {
  return callout?.enabled === true && callout.style.typography.fontFamily === 'cursive';
}

export function getFrameCalloutFontProbeText(callout: CalloutSettings): string {
  return [FRAME_CALLOUT_FONT_PROBE_TEXT, callout.content.titleText, callout.content.bodyHtml]
    .filter(Boolean)
    .join(' ');
}

export async function loadFrameCalloutHandwrittenFont(
  document: { fonts: Pick<FontFaceSet, 'check' | 'load'> },
  text: string
): Promise<boolean> {
  const fonts = document.fonts;
  if (!fonts) return false;
  const loaded = await fonts.load(FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD, text);
  return loaded.length > 0 && fonts.check(FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD, text);
}
