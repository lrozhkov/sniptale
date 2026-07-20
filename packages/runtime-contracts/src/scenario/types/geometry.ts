export interface ScenarioPoint {
  x: number;
  y: number;
}

export interface ScenarioRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScenarioFramePadding {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface ScenarioImageTransform {
  scale: number;
  x: number;
  y: number;
}

export interface ScenarioViewportTransform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScenarioAssetRef {
  assetId: string;
  galleryAssetId: string | null;
}

export interface ScenarioTargetDescriptor {
  selector: string | null;
  iframeSelector: string | null;
  tagName: string | null;
  role: string | null;
  text: string | null;
  ariaLabel: string | null;
  title: string | null;
  rect: ScenarioRect | null;
  framePadding: ScenarioFramePadding | null;
}

export interface ScenarioPageDescriptor {
  title: string | null;
  url: string | null;
  viewport: ScenarioRect;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

export interface ScenarioPointerRange {
  start: ScenarioPoint;
  end: ScenarioPoint;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  distance: number;
  durationMs: number;
}

export interface ScenarioScrollMetadata {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  deltaX: number;
  deltaY: number;
}

export interface ScenarioCaptureMetadata {
  pointerRange: ScenarioPointerRange | null;
  scroll: ScenarioScrollMetadata | null;
  trigger: 'keyboard-enter' | 'pointer-up';
}
