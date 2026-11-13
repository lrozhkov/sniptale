import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef, PreparedAssetObject } from '../assets/contracts';

export interface PersistedEditorAssetPointer {
  assetId: string;
}

interface PersistedEditorDocumentBase extends Omit<
  EditorDocument,
  'browserFrame' | 'frame' | 'sourceImageData' | 'version'
> {
  sourceImage: PersistedEditorAssetPointer;
  frame: Omit<EditorDocument['frame'], 'backgroundImageData'> & {
    backgroundImage: PersistedEditorAssetPointer | null;
  };
  browserFrame?:
    | (Omit<NonNullable<EditorDocument['browserFrame']>, 'faviconDataUrl'> & {
        favicon: PersistedEditorAssetPointer | null;
      })
    | undefined;
  assets: PersistedEditorDocumentAsset[];
}

/** Legacy persisted documents contain no retained raster metadata. */
export interface PersistedEditorDocumentV3 extends PersistedEditorDocumentBase {
  version: 3;
}

/** Retained raster documents use logical format 3 and persisted format 4. */
export interface PersistedEditorDocumentV4 extends PersistedEditorDocumentBase {
  version: 4;
}

export type PersistedEditorDocument = PersistedEditorDocumentV3 | PersistedEditorDocumentV4;

export interface PersistedEditorDocumentAsset extends PersistedEditorAssetPointer {
  role: string;
}

export interface PreparedEditorDocument {
  document: PersistedEditorDocument;
  objects: PreparedAssetObject[];
  refs: AssetRef[];
  runtimeAssetsByUrl: ReadonlyMap<string, AssetRef>;
}

export interface HydratedEditorDocument {
  assetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
  document: EditorDocument;
  release(): void;
}
