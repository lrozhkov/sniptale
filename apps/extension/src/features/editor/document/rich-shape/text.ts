import { DEFAULT_RICH_SHAPE_TEXT } from './defaults';
import type {
  EditorRichShapeAutofitMode,
  EditorRichShapeHorizontalAlign,
  EditorRichShapeTextRotationPolicy,
  EditorRichShapeTextState,
  EditorRichShapeVerticalAlign,
  EditorRichShapeWrapMode,
} from './types';
import { isRecord, numberOr, oneOfOr, stringOr } from './values';

const FONT_WEIGHTS = ['normal', 'bold'] as const;
const FONT_STYLES = ['normal', 'italic'] as const;
const HORIZONTAL_ALIGNS: readonly EditorRichShapeHorizontalAlign[] = [
  'left',
  'center',
  'right',
  'justify',
];
const VERTICAL_ALIGNS: readonly EditorRichShapeVerticalAlign[] = ['top', 'middle', 'bottom'];
const AUTOFIT_MODES: readonly EditorRichShapeAutofitMode[] = [
  'none',
  'shrink-text',
  'resize-shape',
];
const WRAP_MODES: readonly EditorRichShapeWrapMode[] = ['wrap', 'overflow', 'clip'];
const ROTATION_POLICIES: readonly EditorRichShapeTextRotationPolicy[] = [
  'shape',
  'upright',
  'fixed',
];

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeText(value: unknown): EditorRichShapeTextState {
  const text = isRecord(value) ? value : {};
  const insets = isRecord(text['insets']) ? text['insets'] : {};
  return {
    ...DEFAULT_RICH_SHAPE_TEXT,
    content: stringOr(text['content'], DEFAULT_RICH_SHAPE_TEXT.content),
    fontFamily: stringOr(text['fontFamily'], DEFAULT_RICH_SHAPE_TEXT.fontFamily),
    fontSize: numberOr(text['fontSize'], DEFAULT_RICH_SHAPE_TEXT.fontSize),
    fontWeight: oneOfOr(text['fontWeight'], FONT_WEIGHTS, DEFAULT_RICH_SHAPE_TEXT.fontWeight),
    fontStyle: oneOfOr(text['fontStyle'], FONT_STYLES, DEFAULT_RICH_SHAPE_TEXT.fontStyle),
    underline: booleanOr(text['underline'], DEFAULT_RICH_SHAPE_TEXT.underline),
    strike: booleanOr(text['strike'], DEFAULT_RICH_SHAPE_TEXT.strike),
    color: stringOr(text['color'], DEFAULT_RICH_SHAPE_TEXT.color),
    insets: {
      top: numberOr(insets['top'], DEFAULT_RICH_SHAPE_TEXT.insets.top),
      right: numberOr(insets['right'], DEFAULT_RICH_SHAPE_TEXT.insets.right),
      bottom: numberOr(insets['bottom'], DEFAULT_RICH_SHAPE_TEXT.insets.bottom),
      left: numberOr(insets['left'], DEFAULT_RICH_SHAPE_TEXT.insets.left),
    },
    horizontalAlign: oneOfOr(
      text['horizontalAlign'],
      HORIZONTAL_ALIGNS,
      DEFAULT_RICH_SHAPE_TEXT.horizontalAlign
    ),
    verticalAlign: oneOfOr(
      text['verticalAlign'],
      VERTICAL_ALIGNS,
      DEFAULT_RICH_SHAPE_TEXT.verticalAlign
    ),
    autofit: oneOfOr(text['autofit'], AUTOFIT_MODES, DEFAULT_RICH_SHAPE_TEXT.autofit),
    wrap: oneOfOr(text['wrap'], WRAP_MODES, DEFAULT_RICH_SHAPE_TEXT.wrap),
    rotationPolicy: oneOfOr(
      text['rotationPolicy'],
      ROTATION_POLICIES,
      DEFAULT_RICH_SHAPE_TEXT.rotationPolicy
    ),
  };
}
