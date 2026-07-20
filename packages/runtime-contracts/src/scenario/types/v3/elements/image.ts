import type {
  ScenarioAssetRef,
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '../geometry';
import type { ScenarioElementStylePatch, ScenarioV3ElementBase } from './base';

interface ScenarioImageContentTransform {
  scale: number;
  x: number;
  y: number;
}

interface ScenarioCaptureContext {
  captureMetadata: ScenarioCaptureMetadata;
  cursorPoint: ScenarioPoint | null;
  interactionPoint: ScenarioPoint | null;
  page: ScenarioPageDescriptor;
  target: ScenarioTargetDescriptor | null;
}

export interface ScenarioImageElement extends ScenarioV3ElementBase<'image'> {
  assetRef: ScenarioAssetRef;
  captureContext: ScenarioCaptureContext | null;
  contentTransform: ScenarioImageContentTransform;
  editDocumentId: string | null;
  fit: 'contain' | 'cover' | 'fill' | 'original';
}

export interface ScenarioImageElementPatch extends ScenarioElementStylePatch {
  contentTransform?: Partial<ScenarioImageContentTransform>;
  editDocumentId?: string | null;
  fit?: ScenarioImageElement['fit'];
}
