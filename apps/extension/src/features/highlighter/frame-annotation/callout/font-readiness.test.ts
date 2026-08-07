// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createDefaultFrameCallout } from '../defaults';
import {
  FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD,
  getFrameCalloutFontProbeText,
  loadFrameCalloutHandwrittenFont,
  requiresFrameCalloutHandwrittenFont,
} from './font-readiness';

it('loads and verifies the exact shared handwritten face with Latin and Cyrillic probes', async () => {
  const callout = createDefaultFrameCallout();
  callout.style.typography.fontFamily = 'cursive';
  const load = vi.fn(async () => [{} as FontFace]);
  const check = vi.fn(() => true);
  const owner = { fonts: { load, check } };
  const text = getFrameCalloutFontProbeText(callout);

  expect(requiresFrameCalloutHandwrittenFont(callout)).toBe(true);
  await expect(loadFrameCalloutHandwrittenFont(owner, text)).resolves.toBe(true);
  expect(text).toContain('AaБб');
  expect(load).toHaveBeenCalledWith(FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD, text);
  expect(check).toHaveBeenCalledWith(FRAME_CALLOUT_HANDWRITTEN_FONT_LOAD, text);
});
