import { translate } from '../../../platform/i18n';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';

export function updateRectOverlay(
  overlay: ScenarioOverlay,
  patch: Partial<{ x: number; y: number; width: number; height: number }>
): ScenarioOverlay {
  if (
    overlay.kind !== 'focus-rect' &&
    overlay.kind !== 'rectangle' &&
    overlay.kind !== 'ellipse' &&
    overlay.kind !== 'blur-rect'
  ) {
    return overlay;
  }

  return {
    ...overlay,
    rect: {
      ...overlay.rect,
      ...patch,
    },
  };
}

export function updatePointOverlay<
  TOverlay extends Extract<ScenarioOverlay, { point: { x: number; y: number } }>,
>(overlay: TOverlay, patch: Partial<TOverlay['point']>): TOverlay {
  return {
    ...overlay,
    point: {
      ...overlay.point,
      ...patch,
    },
  };
}

export function getOverlayKindLabel(kind: ScenarioOverlay['kind']): string {
  return translate(`scenario.editor.overlayKinds.${kind}`);
}
