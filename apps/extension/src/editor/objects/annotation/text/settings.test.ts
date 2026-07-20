// @vitest-environment jsdom
import { Textbox } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { EditorTextSettings } from '../../../../features/editor/document/types';
import { applyTextboxCalloutSettings } from './settings';
import { DEFAULT_EDITOR_TEXTBOX_WIDTH } from './textbox';

vi.mock('./callout/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./callout/lifecycle')>()),
  applyTextCalloutRendering: vi.fn(),
}));

const baseSettings: EditorTextSettings = {
  backgroundColor: '#ffffff',
  backgroundOpacity: 1,
  calloutFormat: 'plain',
  layoutMode: 'fixed-width',
  fontFamily: 'sans',
  fontSize: 16,
  fontStyle: 'normal',
  fontWeight: 'normal',
  linethrough: false,
  shadow: 0,
  shadowAngle: 90,
  shadowBlur: 12,
  shadowColor: '#000000',
  shadowDistance: 4,
  tailSize: 0,
  textAlign: 'left',
  verticalAlign: 'center',
  textColor: '#000000',
  textOpacity: 1,
  underline: false,
};

it('keeps plain text callout metadata bounded to the default textbox width', () => {
  const textbox = new Textbox('Plain');
  textbox.sniptaleTextCalloutHeight = 120;

  applyTextboxCalloutSettings(textbox, baseSettings);

  expect(textbox.sniptaleTextCalloutFormat).toBe('plain');
  expect(textbox.sniptaleTextCalloutWidth).toBe(DEFAULT_EDITOR_TEXTBOX_WIDTH);
  expect(textbox.sniptaleTextCalloutHeight).toBeLessThan(120);
  expect(textbox.sniptaleTextLayoutMode).toBe('fixed-width');
  expect(textbox.sniptaleTextVerticalAlign).toBe('center');
});
