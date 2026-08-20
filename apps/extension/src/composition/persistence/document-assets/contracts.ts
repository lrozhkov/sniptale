import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef, PreparedAssetObject } from '../assets';

export interface PersistedEditorAssetPointer {
  assetId: string;
}

export interface PersistedEditorDocumentV3 extends Omit<
  EditorDocument,
  'browserFrame' | 'frame' | 'sourceImageData' | 'version'
> {
  version: 3;
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

export interface PersistedEditorDocumentAsset extends PersistedEditorAssetPointer {
  role: string;
}

export interface PreparedEditorDocument {
  document: PersistedEditorDocumentV3;
  objects: PreparedAssetObject[];
  refs: AssetRef[];
  runtimeAssetsByUrl: ReadonlyMap<string, AssetRef>;
}

export interface HydratedEditorDocument {
  assetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
  document: EditorDocument;
  release(): void;
}
