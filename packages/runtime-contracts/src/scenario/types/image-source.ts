import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from './geometry';

/** A captured image retains its source context independently of other images in the step. */
export interface GuideCaptureSource {
  kind: 'capture';
  captureSurface: 'visible' | 'full' | 'selection';
  sourceKind: 'manual' | 'auto-click';
  page: ScenarioPageDescriptor;
  target: ScenarioTargetDescriptor | null;
  interactionPoint: ScenarioPoint | null;
  cursorPoint: ScenarioPoint | null;
  captureMetadata: ScenarioCaptureMetadata;
}

/** Bounded recording context; point uses normalized source-frame coordinates. */
export interface GuideVideoAction {
  id: string;
  kind: 'CLICK' | 'KEY';
  time: number;
  duration: number;
  label: string;
  point: { x: number; y: number } | null;
  target: { name: string; tag: string; role: string } | null;
}

/** Source references are provenance; rendering uses the image block's durable assetId. */
export type GuideImageSource =
  | GuideCaptureSource
  | { kind: 'import'; filename: string }
  | {
      kind: 'video-frame';
      recordingId: string | null;
      filename: string;
      timeSeconds: number;
      action?: GuideVideoAction | undefined;
    };
