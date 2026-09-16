import type {
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioOverlay } from '../contracts/types/overlays';
import { buildClickRingOverlay, buildFocusRectOverlay } from './overlay-factories';

export function buildAutoScenarioCaptureOverlays(args: {
  cursorPoint?: ScenarioPoint | null;
  interactionPoint?: ScenarioPoint | null;
  target?: ScenarioTargetDescriptor | null;
}): ScenarioOverlay[] {
  const focusOverlays = args.target
    ? buildFocusRectOverlay(args.target, { autoSource: 'capture-target' })
    : [];
  const clickPoint = args.cursorPoint ?? args.interactionPoint ?? null;

  return [
    ...focusOverlays,
    ...(focusOverlays.length === 0
      ? buildClickRingOverlay(clickPoint, { autoSource: 'capture-click' })
      : []),
  ];
}
