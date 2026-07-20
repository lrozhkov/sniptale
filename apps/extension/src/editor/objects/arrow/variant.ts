import type {
  EditorArrowMode,
  EditorArrowSettings,
  EditorArrowType,
  EditorArrowVariant,
} from '../../../features/editor/document/types';

interface ArrowInteractionAppearance {
  cornerSize: number;
  cornerStyle: 'circle' | 'rect';
  hasBorders: boolean;
  hoverCursor: 'move' | 'pointer';
  lockRotation: boolean;
  lockScaling: boolean;
  moveCursor: 'grab' | 'grabbing';
}

const STANDARD_ARROW_INTERACTION: ArrowInteractionAppearance = {
  cornerSize: 14,
  cornerStyle: 'circle',
  hasBorders: false,
  hoverCursor: 'pointer',
  lockRotation: true,
  lockScaling: true,
  moveCursor: 'grabbing',
};

const TAPERED_ARROW_INTERACTION: ArrowInteractionAppearance = {
  cornerSize: 14,
  cornerStyle: 'circle',
  hasBorders: false,
  hoverCursor: 'pointer',
  lockRotation: true,
  lockScaling: true,
  moveCursor: 'grabbing',
};

export function resolveArrowVariant(value: unknown): EditorArrowVariant {
  return value === 'tapered' ? 'tapered' : 'standard';
}

export function resolveArrowType(value: unknown): EditorArrowType {
  if (value === 'curved' || value === 'elbow') {
    return value;
  }
  return 'sharp';
}

export function isTaperedArrowVariant(settings: EditorArrowSettings): boolean {
  return resolveArrowVariant(settings.variant) === 'tapered';
}

export function getEffectiveArrowMode(settings: EditorArrowSettings): EditorArrowMode {
  const arrowType = resolveArrowType(settings.arrowType);
  return arrowType === 'curved' || (arrowType !== 'elbow' && settings.mode === 'curve')
    ? 'curve'
    : 'straight';
}

export function hasArrowPointControls(_settings: EditorArrowSettings): boolean {
  return true;
}

export function hasArrowCurvePointEditing(settings: EditorArrowSettings): boolean {
  return (
    resolveArrowVariant(settings.variant) === 'standard' ||
    resolveArrowVariant(settings.variant) === 'tapered'
  );
}

export function resolveArrowInteractionAppearance(
  settings: EditorArrowSettings
): ArrowInteractionAppearance {
  return isTaperedArrowVariant(settings) ? TAPERED_ARROW_INTERACTION : STANDARD_ARROW_INTERACTION;
}
