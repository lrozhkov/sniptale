import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
  ScenarioNoteTone,
  ScenarioAnnotationRenderMode,
  ScenarioStepKind,
  ScenarioSuggestedEventKind,
  ScenarioSuggestedEventStatus,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioImageTransform,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
  ScenarioViewportTransform,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioOverlay } from './overlays';

export interface ScenarioSuggestedEvent {
  id: string;
  kind: ScenarioSuggestedEventKind;
  status: ScenarioSuggestedEventStatus;
  createdAt: number;
  message: string;
  sourceStepId: string | null;
  target: ScenarioTargetDescriptor | null;
  data: Record<string, string | number | boolean | null>;
}

interface ScenarioStepBase {
  id: string;
  kind: ScenarioStepKind;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioCaptureStep extends ScenarioStepBase {
  kind: 'capture';
  assetId: string;
  galleryAssetId: string | null;
  captureSurface: 'visible' | 'full' | 'selection';
  sourceKind: 'manual' | 'auto-click';
  page: ScenarioPageDescriptor;
  target: ScenarioTargetDescriptor | null;
  interactionPoint: ScenarioPoint | null;
  cursorPoint: ScenarioPoint | null;
  captureMetadata: ScenarioCaptureMetadata;
  overlays: ScenarioOverlay[];
  annotationRenderMode?: ScenarioAnnotationRenderMode;
  imageTransform: ScenarioImageTransform;
  viewportTransform: ScenarioViewportTransform;
}

export interface ScenarioSectionStep extends ScenarioStepBase {
  kind: 'section';
}

export interface ScenarioNoteStep extends ScenarioStepBase {
  kind: 'note';
  tone: ScenarioNoteTone;
}

export interface ScenarioDividerStep extends ScenarioStepBase {
  kind: 'divider';
}

export type ScenarioStep =
  | ScenarioCaptureStep
  | ScenarioSectionStep
  | ScenarioNoteStep
  | ScenarioDividerStep;

export interface ScenarioStepPatch {
  annotationRenderMode?: ScenarioAnnotationRenderMode;
  body?: string;
  imageTransform?: ScenarioImageTransform;
  overlays?: ScenarioOverlay[];
  title?: string;
  tone?: ScenarioNoteTone;
  viewportTransform?: ScenarioViewportTransform;
}

export interface ScenarioProject {
  version: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  steps: ScenarioStep[];
  trash: Array<{
    deletedAt: number;
    originalIndex: number;
    step: ScenarioStep;
  }>;
  suggestedEvents: ScenarioSuggestedEvent[];
}

export interface ScenarioProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
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
  position: number;
  previewDataUrl: string;
  title: string;
}

export interface ScenarioTrashedStep {
  id: string;
  deletedAt: number;
  kind: ScenarioStepKind;
  originalIndex: number;
  title: string;
}
