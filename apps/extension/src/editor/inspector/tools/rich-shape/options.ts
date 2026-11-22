import { translate } from '../../../../platform/i18n';
import type {
  EditorRichShapeArrowhead,
  EditorRichShapeDashStyle,
  EditorRichShapeLineCap,
  EditorRichShapeLineJoin,
  EditorRichShapeRoughFillStyle,
} from '../../../../features/editor/document/rich-shape';
import type { CompactSelectOption } from '../../../chrome/ui';

export const RICH_SHAPE_DASH_OPTIONS = [
  {
    value: 'solid',
    get label() {
      return translate('highlighter.editor.styleSolid');
    },
  },
  {
    value: 'dash',
    get label() {
      return translate('highlighter.editor.styleDashed');
    },
  },
  {
    value: 'dot',
    get label() {
      return translate('highlighter.editor.styleDotted');
    },
  },
  {
    value: 'dash-dot',
    get label() {
      return translate('editor.compact.richShapeDashDot');
    },
  },
  {
    value: 'long-dash',
    get label() {
      return translate('editor.compact.richShapeLongDash');
    },
  },
] satisfies CompactSelectOption<EditorRichShapeDashStyle>[];

export const RICH_SHAPE_CAP_OPTIONS = [
  {
    value: 'butt',
    get label() {
      return translate('editor.compact.richShapeCapButt');
    },
  },
  {
    value: 'round',
    get label() {
      return translate('editor.compact.richShapeCapRound');
    },
  },
  {
    value: 'square',
    get label() {
      return translate('editor.compact.richShapeCapSquare');
    },
  },
] satisfies CompactSelectOption<EditorRichShapeLineCap>[];

export const RICH_SHAPE_JOIN_OPTIONS = [
  {
    value: 'miter',
    get label() {
      return translate('editor.compact.richShapeJoinMiter');
    },
  },
  {
    value: 'round',
    get label() {
      return translate('editor.compact.richShapeJoinRound');
    },
  },
  {
    value: 'bevel',
    get label() {
      return translate('editor.compact.richShapeJoinBevel');
    },
  },
] satisfies CompactSelectOption<EditorRichShapeLineJoin>[];

export const RICH_SHAPE_ARROWHEAD_OPTIONS = [
  {
    value: 'none',
    get label() {
      return translate('editor.compact.arrowHeadNone');
    },
  },
  {
    value: 'triangle',
    get label() {
      return translate('editor.compact.arrowHeadTriangle');
    },
  },
  {
    value: 'open',
    get label() {
      return translate('editor.compact.arrowHeadOpen');
    },
  },
  {
    value: 'stealth',
    get label() {
      return translate('editor.compact.richShapeArrowHeadStealth');
    },
  },
  {
    value: 'diamond',
    get label() {
      return translate('editor.compact.arrowHeadDiamond');
    },
  },
  {
    value: 'oval',
    get label() {
      return translate('editor.compact.richShapeArrowHeadOval');
    },
  },
] satisfies CompactSelectOption<EditorRichShapeArrowhead>[];

export const RICH_SHAPE_ROUGH_FILL_OPTIONS = [
  {
    value: 'hachure',
    get label() {
      return translate('editor.compact.richShapeRoughFillHachure');
    },
  },
  {
    value: 'solid',
    get label() {
      return translate('editor.compact.richShapeRoughFillSolid');
    },
  },
  {
    value: 'zigzag',
    get label() {
      return translate('editor.compact.richShapeRoughFillZigzag');
    },
  },
  {
    value: 'cross-hatch',
    get label() {
      return translate('editor.compact.richShapeRoughFillCrossHatch');
    },
  },
  {
    value: 'dots',
    get label() {
      return translate('editor.compact.richShapeRoughFillDots');
    },
  },
  {
    value: 'dashed',
    get label() {
      return translate('editor.compact.richShapeRoughFillDashed');
    },
  },
  {
    value: 'zigzag-line',
    get label() {
      return translate('editor.compact.richShapeRoughFillZigzagLine');
    },
  },
] satisfies CompactSelectOption<EditorRichShapeRoughFillStyle>[];
