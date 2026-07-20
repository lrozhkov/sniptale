export type {
  ScenarioAssetRef,
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioRect,
  ScenarioTargetDescriptor,
} from '../geometry';

export interface ScenarioSlideCanvas {
  background: ScenarioCanvasBackground;
  height: number;
  width: number;
}

export type ScenarioCanvasBackground =
  | {
      color: string;
      kind: 'solid';
    }
  | {
      kind: 'transparent';
    };

export interface ScenarioElementFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}
