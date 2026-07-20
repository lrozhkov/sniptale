import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioAssetRef,
  ScenarioCaptureMetadata,
  ScenarioElementFrame,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export type CaptureCompositionKind =
  | 'click-sequence'
  | 'full-screen-context'
  | 'side-note-walkthrough'
  | 'sparse-viewport'
  | 'target-focused';

export interface CaptureAssetSize {
  height: number | null;
  width: number | null;
}

export interface ScenarioCaptureSlideInput {
  assetRef: ScenarioAssetRef;
  assetSize: CaptureAssetSize;
  body: string;
  captureMetadata: ScenarioCaptureMetadata;
  captureSurface: ScenarioCaptureSurface;
  cursorPoint: ScenarioPoint | null;
  interactionPoint: ScenarioPoint | null;
  now: number;
  page: ScenarioPageDescriptor;
  slideIndex: number;
  sourceKind: ScenarioCaptureSourceKind;
  target: ScenarioTargetDescriptor | null;
  title: string;
}

export interface CaptureLayout {
  calloutAnchor: 'corner' | 'side' | 'none';
  imageFrame: ScenarioElementFrame;
  kind: CaptureCompositionKind;
  slideBackgroundColor: string;
}
