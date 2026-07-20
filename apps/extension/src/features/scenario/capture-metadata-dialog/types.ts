import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';

type ScenarioMetadataItem = {
  label: string;
  value: string;
};

export type ScenarioMetadataSection = {
  items: ScenarioMetadataItem[];
  title: string;
};

export type ScenarioCaptureMetadataView = {
  captureMetadata: ScenarioCaptureMetadata;
  captureSurface: ScenarioCaptureSurface;
  cursorPoint: ScenarioPoint | null;
  interactionPoint: ScenarioPoint | null;
  page: ScenarioPageDescriptor;
  sourceKind: ScenarioCaptureSourceKind;
  target: ScenarioTargetDescriptor | null;
};
