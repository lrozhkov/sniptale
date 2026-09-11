import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';

export interface ScenarioProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  lifecycle?: import('../../../../contracts/settings/library-lifecycle').LibraryLifecycle;
  workspaceRevision?: number;
  availability: 'available' | 'unsupported' | 'invalid';
}

export interface ScenarioRecentStep {
  id: string;
  metadata?: {
    captureMetadata: ScenarioCaptureMetadata;
    captureSurface: ScenarioCaptureSurface;
    cursorPoint: ScenarioPoint | null;
    interactionPoint: ScenarioPoint | null;
    page: ScenarioPageDescriptor;
    sourceKind: ScenarioCaptureSourceKind;
    target: ScenarioTargetDescriptor | null;
  };
  /** Document item index used as the drag/drop destination. */
  position: number;
  /** One-based ordinal among steps; sections never increment it. */
  stepNumber: number;
  previewDataUrl: string;
  title: string;
}
