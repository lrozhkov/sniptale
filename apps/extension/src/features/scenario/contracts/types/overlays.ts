import type { BlurSettings } from '@sniptale/ui/highlighter-style/types';
import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';

export type ScenarioOverlayAutoSource = 'capture-target' | 'capture-click';

interface ScenarioOverlayBase {
  id: string;
  autoSource?: ScenarioOverlayAutoSource;
}

export type ScenarioOverlay =
  | (ScenarioOverlayBase & {
      kind: 'focus-rect';
      rect: ScenarioRect;
    })
  | (ScenarioOverlayBase & {
      kind: 'click-ring';
      point: ScenarioPoint;
    })
  | (ScenarioOverlayBase & {
      kind: 'cursor';
      point: ScenarioPoint;
    })
  | (ScenarioOverlayBase & {
      kind: 'blur-rect';
      rect: ScenarioRect;
      blurSettings: BlurSettings;
    })
  | (ScenarioOverlayBase & {
      kind: 'arrow';
      start: ScenarioPoint;
      end: ScenarioPoint;
      color: string;
      strokeWidth: number;
    })
  | (ScenarioOverlayBase & {
      kind: 'rectangle';
      rect: ScenarioRect;
      strokeColor: string;
      fillColor: string;
      strokeWidth: number;
    })
  | (ScenarioOverlayBase & {
      kind: 'ellipse';
      rect: ScenarioRect;
      strokeColor: string;
      fillColor: string;
      strokeWidth: number;
    })
  | (ScenarioOverlayBase & {
      kind: 'text';
      point: ScenarioPoint;
      text: string;
      color: string;
      fontSize: number;
      fontFamily: string;
      fontWeight: number;
    });
