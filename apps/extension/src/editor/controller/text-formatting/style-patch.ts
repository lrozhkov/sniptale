import type { Textbox } from 'fabric';
import type { EditorTextSettings } from '../../../features/editor/document/types';
import type { EditorTextInlineStyleCommand } from './commands';

type TextStylePatch = Partial<
  Pick<EditorTextSettings, 'fontStyle' | 'fontWeight' | 'linethrough' | 'underline'>
>;

type TextSelectionStyle = TextStylePatch & {
  [key: string]: unknown;
};

export function getSelectionStylePatch(
  textbox: Textbox,
  command: EditorTextInlineStyleCommand,
  start: number,
  end: number
): TextStylePatch {
  const styles = textbox.getSelectionStyles(start, end, true) as TextSelectionStyle[];

  switch (command) {
    case 'bold':
      return { fontWeight: isFontWeightActive(styles) ? 'normal' : 'bold' };
    case 'italic':
      return { fontStyle: isFontStyleActive(styles) ? 'normal' : 'italic' };
    case 'underline':
      return { underline: !isBooleanStyleActive(styles, 'underline') };
    case 'linethrough':
      return { linethrough: !isBooleanStyleActive(styles, 'linethrough') };
  }
}

export function getObjectStylePatch(
  textbox: Textbox,
  command: EditorTextInlineStyleCommand
): TextStylePatch {
  switch (command) {
    case 'bold':
      return { fontWeight: textbox.fontWeight === 'bold' ? 'normal' : 'bold' };
    case 'italic':
      return { fontStyle: textbox.fontStyle === 'italic' ? 'normal' : 'italic' };
    case 'underline':
      return { underline: !textbox.underline };
    case 'linethrough':
      return { linethrough: !textbox.linethrough };
  }
}

export function getTextSettingsStylePatch(
  settings: EditorTextSettings,
  command: EditorTextInlineStyleCommand
): TextStylePatch {
  switch (command) {
    case 'bold':
      return { fontWeight: settings.fontWeight === 'bold' ? 'normal' : 'bold' };
    case 'italic':
      return { fontStyle: settings.fontStyle === 'italic' ? 'normal' : 'italic' };
    case 'underline':
      return { underline: !settings.underline };
    case 'linethrough':
      return { linethrough: !settings.linethrough };
  }
}

function isBooleanStyleActive(styles: TextSelectionStyle[], key: 'linethrough' | 'underline') {
  return styles.length > 0 && styles.every((style) => style[key] === true);
}

function isFontWeightActive(styles: TextSelectionStyle[]): boolean {
  return styles.length > 0 && styles.every((style) => style.fontWeight === 'bold');
}

function isFontStyleActive(styles: TextSelectionStyle[]): boolean {
  return styles.length > 0 && styles.every((style) => style.fontStyle === 'italic');
}
