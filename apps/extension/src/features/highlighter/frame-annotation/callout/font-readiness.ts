import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { resolveCalloutCustomCss } from '../../callout-custom-css';

export const FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD = '400 16px "Sniptale Handwritten"';
const FRAME_CALLOUT_FONT_PROBE_TEXT = 'AaБб';

export function requiresFrameCalloutHandwrittenFont(
  callout: CalloutSettings | undefined
): callout is CalloutSettings {
  if (callout?.enabled !== true) return false;
  if (callout.style.typography.fontFamily === 'cursive') return true;
  if (callout.style.title.enabled && callout.style.title.fontFamily === 'cursive') return true;
  const customStyles = resolveCalloutCustomCss(callout.style.customCss).styles;
  return [customStyles.body.fontFamily, customStyles.title.fontFamily].some(
    (family) => typeof family === 'string' && family.includes('Sniptale Handwritten')
  );
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
