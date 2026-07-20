import { normalizeEditorArrowHeadSize } from '../../../features/editor/document/arrow';
import { type EditorArrowSettings } from '../../../features/editor/document/types';
import { EDITOR_CANVAS_ACCENT } from '../../color/palette/constants';
import { normalizeShadowPreset } from '../shadow';
import type { ArrowPathInstance } from './controls.types';
import { resolveArrowType, resolveArrowVariant } from './variant';

export function readArrowSettings(arrow: ArrowPathInstance): EditorArrowSettings {
  const legacyVariant = resolveArrowVariant(arrow.sniptaleArrowVariant);
  const arrowType = resolveArrowType(arrow.sniptaleArrowType);
  const dynamicWidth =
    typeof arrow.sniptaleArrowDynamicWidth === 'boolean'
      ? arrow.sniptaleArrowDynamicWidth
      : legacyVariant === 'tapered';

  return {
    color: arrow.sniptaleArrowColor ?? EDITOR_CANVAS_ACCENT,
    width:
      typeof arrow.sniptaleArrowWidth === 'number'
        ? arrow.sniptaleArrowWidth
        : typeof arrow.strokeWidth === 'number'
          ? arrow.strokeWidth
          : 4,
    style: arrow.sniptaleArrowStyle ?? 'solid',
    opacity: typeof arrow.sniptaleArrowOpacity === 'number' ? arrow.sniptaleArrowOpacity : 1,
    shadow: normalizeShadowPreset(arrow.sniptaleArrowShadow),
    shadowAngle:
      typeof arrow.sniptaleArrowShadowAngle === 'number' ? arrow.sniptaleArrowShadowAngle : 90,
    shadowBlur:
      typeof arrow.sniptaleArrowShadowBlur === 'number' ? arrow.sniptaleArrowShadowBlur : 12,
    shadowColor:
      typeof arrow.sniptaleArrowShadowColor === 'string'
        ? arrow.sniptaleArrowShadowColor
        : (arrow.sniptaleArrowColor ?? EDITOR_CANVAS_ACCENT),
    shadowDistance:
      typeof arrow.sniptaleArrowShadowDistance === 'number' ? arrow.sniptaleArrowShadowDistance : 4,
    variant: legacyVariant,
    mode: arrowType === 'curved' ? 'curve' : (arrow.sniptaleArrowMode ?? 'straight'),
    arrowType,
    dynamicWidth,
    roughness: typeof arrow.sniptaleArrowRoughness === 'number' ? arrow.sniptaleArrowRoughness : 0,
    bowing: typeof arrow.sniptaleArrowBowing === 'number' ? arrow.sniptaleArrowBowing : 0,
    startHead: arrow.sniptaleArrowStartHead ?? 'none',
    startHeadSize: normalizeEditorArrowHeadSize(arrow.sniptaleArrowStartHeadSize),
    endHead: arrow.sniptaleArrowEndHead ?? 'triangle',
    endHeadSize: normalizeEditorArrowHeadSize(arrow.sniptaleArrowEndHeadSize),
  };
}
