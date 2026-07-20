import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type {
  applyVideoAnnotationAutoFade,
  createAnnotationElement,
  updateAnnotationElement,
} from './runtime';
import type { createVideoAnnotationsOverlay } from './svg';

export interface VideoAnnotationsControllerDeps {
  addOverlayNode?: <T extends Node>(node: T) => T;
  addListener?: typeof document.addEventListener;
  removeListener?: typeof document.removeEventListener;
  applyAutoFade?: typeof applyVideoAnnotationAutoFade;
  createAnnotationElement?: typeof createAnnotationElement;
  createOverlay?: typeof createVideoAnnotationsOverlay;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  updateAnnotationElement?: typeof updateAnnotationElement;
}

export type VideoAnnotationsState = {
  currentElement: SVGElement | null;
  isDrawing: boolean;
  isEnabled: boolean;
  settings: VideoRecordingSettings | null;
  startX: number;
  startY: number;
  svgContainer: SVGSVGElement | null;
};

export interface VideoAnnotationsController {
  enable: (videoSettings?: VideoRecordingSettings) => void;
  disable: () => void;
  isEnabled: () => boolean;
}

export type VideoAnnotationsRuntimeDeps = Required<VideoAnnotationsControllerDeps>;

export function createVideoAnnotationsState(): VideoAnnotationsState {
  return {
    currentElement: null,
    isDrawing: false,
    isEnabled: false,
    settings: null,
    startX: 0,
    startY: 0,
    svgContainer: null,
  };
}
