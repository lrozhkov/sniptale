import type { ScenarioCaptureStep } from '../contracts/types/project';
import type { ScenarioOverlay } from '../contracts/types/overlays';
import { buildClickRingOverlay, buildFocusRectOverlay } from './overlay-factories';

export type ScenarioCaptureAutoOverlayKind = 'click' | 'frame';

const AUTO_SOURCE_BY_KIND = {
  frame: 'capture-target',
  click: 'capture-click',
} as const;

function getAutoOverlaySource(kind: ScenarioCaptureAutoOverlayKind) {
  return AUTO_SOURCE_BY_KIND[kind];
}

function buildAutoOverlay(
  step: ScenarioCaptureStep,
  kind: ScenarioCaptureAutoOverlayKind
): ScenarioOverlay[] {
  if (kind === 'frame') {
    return step.target
      ? buildFocusRectOverlay(step.target, { autoSource: getAutoOverlaySource(kind) })
      : [];
  }

  return buildClickRingOverlay(step.cursorPoint ?? step.interactionPoint, {
    autoSource: getAutoOverlaySource(kind),
  });
}

export function buildAutoScenarioCaptureOverlays(args: {
  cursorPoint?: ScenarioCaptureStep['cursorPoint'];
  interactionPoint?: ScenarioCaptureStep['interactionPoint'];
  target?: ScenarioCaptureStep['target'];
}): ScenarioOverlay[] {
  const focusOverlays = args.target
    ? buildFocusRectOverlay(args.target, { autoSource: getAutoOverlaySource('frame') })
    : [];
  const clickPoint = args.cursorPoint ?? args.interactionPoint ?? null;

  return [
    ...focusOverlays,
    ...(focusOverlays.length === 0
      ? buildClickRingOverlay(clickPoint, { autoSource: getAutoOverlaySource('click') })
      : []),
  ];
}

export function canToggleScenarioCaptureAutoOverlay(
  step: ScenarioCaptureStep,
  kind: ScenarioCaptureAutoOverlayKind
): boolean {
  if (kind === 'frame') {
    return Boolean(step.target?.rect);
  }

  return Boolean(step.cursorPoint ?? step.interactionPoint);
}

export function hasScenarioCaptureAutoOverlay(
  overlays: ScenarioOverlay[],
  kind: ScenarioCaptureAutoOverlayKind
): boolean {
  const autoSource = getAutoOverlaySource(kind);
  return overlays.some((overlay) => overlay.autoSource === autoSource);
}

function removeScenarioCaptureAutoOverlays(
  overlays: ScenarioOverlay[],
  kind: ScenarioCaptureAutoOverlayKind
): ScenarioOverlay[] {
  const autoSource = getAutoOverlaySource(kind);
  return overlays.filter((overlay) => overlay.autoSource !== autoSource);
}

export function toggleScenarioCaptureAutoOverlay(
  step: ScenarioCaptureStep,
  kind: ScenarioCaptureAutoOverlayKind
): { enabled: boolean; overlays: ScenarioOverlay[] } {
  if (!canToggleScenarioCaptureAutoOverlay(step, kind)) {
    return {
      enabled: hasScenarioCaptureAutoOverlay(step.overlays, kind),
      overlays: step.overlays,
    };
  }

  if (hasScenarioCaptureAutoOverlay(step.overlays, kind)) {
    return {
      enabled: false,
      overlays: removeScenarioCaptureAutoOverlays(step.overlays, kind),
    };
  }

  return {
    enabled: true,
    overlays: [...step.overlays, ...buildAutoOverlay(step, kind)],
  };
}
