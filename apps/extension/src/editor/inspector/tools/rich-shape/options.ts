import { translate } from '../../../../platform/i18n';
import type {
  EditorRichShapeArrowhead,
  EditorRichShapeDashStyle,
  EditorRichShapeLineCap,
  EditorRichShapeLineJoin,
  EditorRichShapeRoughFillStyle,
} from '../../../../features/editor/document/rich-shape';
import type { CompactSelectOption } from '../../../chrome/ui';
import { createRoughFillStyleOptions } from '../rough-fill-options';

export const RICH_SHAPE_DASH_OPTIONS = [
  { value: 'solid', label: translate('highlighter.editor.styleSolid') },
  { value: 'dash', label: translate('highlighter.editor.styleDashed') },
  { value: 'dot', label: translate('highlighter.editor.styleDotted') },
  { value: 'dash-dot', label: translate('editor.compact.richShapeDashDot') },
  { value: 'long-dash', label: translate('editor.compact.richShapeLongDash') },
] satisfies CompactSelectOption<EditorRichShapeDashStyle>[];

export const RICH_SHAPE_CAP_OPTIONS = [
  { value: 'butt', label: translate('editor.compact.richShapeCapButt') },
  { value: 'round', label: translate('editor.compact.richShapeCapRound') },
  { value: 'square', label: translate('editor.compact.richShapeCapSquare') },
] satisfies CompactSelectOption<EditorRichShapeLineCap>[];

export const RICH_SHAPE_JOIN_OPTIONS = [
  { value: 'miter', label: translate('editor.compact.richShapeJoinMiter') },
  { value: 'round', label: translate('editor.compact.richShapeJoinRound') },
  { value: 'bevel', label: translate('editor.compact.richShapeJoinBevel') },
] satisfies CompactSelectOption<EditorRichShapeLineJoin>[];

export const RICH_SHAPE_ARROWHEAD_OPTIONS = [
  { value: 'none', label: translate('editor.compact.arrowHeadNone') },
  { value: 'triangle', label: translate('editor.compact.arrowHeadTriangle') },
  { value: 'open', label: translate('editor.compact.arrowHeadOpen') },
  { value: 'stealth', label: translate('editor.compact.richShapeArrowHeadStealth') },
  { value: 'diamond', label: translate('editor.compact.arrowHeadDiamond') },
  { value: 'oval', label: translate('editor.compact.richShapeArrowHeadOval') },
] satisfies CompactSelectOption<EditorRichShapeArrowhead>[];

export const RICH_SHAPE_ROUGH_FILL_OPTIONS =
  createRoughFillStyleOptions<EditorRichShapeRoughFillStyle>();
