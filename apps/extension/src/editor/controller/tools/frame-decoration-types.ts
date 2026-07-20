import type { FabricObject } from 'fabric';

export interface PreparedEditorFrameDecorations {
  browserFrameObjects: { objects: FabricObject[]; sourceClipPath: FabricObject | null };
  frameObjects: FabricObject[];
}

export type EmptyBrowserFrameDecorationObjects =
  PreparedEditorFrameDecorations['browserFrameObjects'];
