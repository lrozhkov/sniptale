import type { FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../features/editor/document/types';

export interface FrameOptions {
  browserFrame: BrowserFrameState;
  source: BrowserFrameSourceRect;
}

export interface BrowserFrameSourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BrowserFrameMockupLayout {
  chrome: BrowserFrameSourceRect;
  content: BrowserFrameSourceRect;
  headerHeight: number;
  radius: number;
}

export interface BrowserFrameDecorationObjects {
  objects: FabricObject[];
  sourceClipPath: FabricObject | null;
}
