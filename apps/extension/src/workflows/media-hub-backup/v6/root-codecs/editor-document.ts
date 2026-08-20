import type { PersistedEditorDocumentV3 } from '../../../../composition/persistence/document-assets';
import { parsePersistedEditorDocument } from '../../../../composition/persistence/document-assets/parser';

const ASSET_URL_PREFIX = 'sniptale-asset:';
const OBJECT_URL_PREFIX = 'sniptale-object:';
const CANVAS_BINARY_FIELDS: readonly string[] = [
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleBlurSourceData',
];

interface PortableEditorAssetPointer {
  objectId: string;
}

export interface PortableEditorDocumentV3 extends Omit<
  PersistedEditorDocumentV3,
  'assets' | 'browserFrame' | 'frame' | 'sourceImage'
> {
  assets: Array<PortableEditorAssetPointer & { role: string }>;
  sourceImage: PortableEditorAssetPointer;
  frame: Omit<PersistedEditorDocumentV3['frame'], 'backgroundImage'> & {
    backgroundImage: PortableEditorAssetPointer | null;
  };
  browserFrame?:
    | (Omit<NonNullable<PersistedEditorDocumentV3['browserFrame']>, 'favicon'> & {
        favicon: PortableEditorAssetPointer | null;
      })
    | undefined;
}

function objectPointer(assetId: string, objectsByAssetId: ReadonlyMap<string, string>) {
  const objectId = objectsByAssetId.get(assetId);
  if (!objectId)
    throw new Error(`Editor document asset is missing from archive inventory: ${assetId}.`);
  return { objectId };
}

function projectCanvasObjects(
  value: unknown,
  objectsByAssetId: ReadonlyMap<string, string>
): unknown {
  if (Array.isArray(value))
    return value.map((item) => projectCanvasObjects(item, objectsByAssetId));
  if (typeof value !== 'object' || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (CANVAS_BINARY_FIELDS.includes(key) && typeof child === 'string') {
      if (!child.startsWith(ASSET_URL_PREFIX)) {
        throw new Error('Editor document canvas contains a non-asset binary reference.');
      }
      const objectId = objectPointer(
        child.slice(ASSET_URL_PREFIX.length),
        objectsByAssetId
      ).objectId;
      output[key] = `${OBJECT_URL_PREFIX}${objectId}`;
    } else {
      output[key] = projectCanvasObjects(child, objectsByAssetId);
    }
  }
  return output;
}

export function encodePortableEditorDocument(args: {
  document: PersistedEditorDocumentV3;
  objectsByAssetId: ReadonlyMap<string, string>;
}): PortableEditorDocumentV3 {
  if (!parsePersistedEditorDocument(args.document)) {
    throw new Error('Stored editor document is invalid for archive export.');
  }
  const canvas = projectCanvasObjects(
    JSON.parse(args.document.canvasJson) as unknown,
    args.objectsByAssetId
  );
  const {
    assets: _assets,
    browserFrame: storedBrowserFrame,
    frame: storedFrame,
    sourceImage: storedSourceImage,
    ...documentMetadata
  } = args.document;
  const { backgroundImage, ...frame } = storedFrame;
  const browserFrame = storedBrowserFrame
    ? (() => {
        const { favicon, ...metadata } = storedBrowserFrame;
        return {
          ...metadata,
          favicon: favicon ? objectPointer(favicon.assetId, args.objectsByAssetId) : null,
        };
      })()
    : undefined;
  return {
    ...documentMetadata,
    assets: args.document.assets.map(({ assetId, role }) => ({
      ...objectPointer(assetId, args.objectsByAssetId),
      role,
    })),
    ...(browserFrame ? { browserFrame } : {}),
    canvasJson: JSON.stringify(canvas),
    frame: {
      ...frame,
      backgroundImage: backgroundImage
        ? objectPointer(backgroundImage.assetId, args.objectsByAssetId)
        : null,
    },
    sourceImage: objectPointer(storedSourceImage.assetId, args.objectsByAssetId),
  };
}

function assetPointer(objectId: string, assetsByObjectId: ReadonlyMap<string, string>) {
  const assetId = assetsByObjectId.get(objectId);
  if (!assetId)
    throw new Error(`Editor archive object is missing from restore inventory: ${objectId}.`);
  return { assetId };
}

function restoreCanvasAssets(
  value: unknown,
  assetsByObjectId: ReadonlyMap<string, string>
): unknown {
  if (Array.isArray(value)) return value.map((item) => restoreCanvasAssets(item, assetsByObjectId));
  if (typeof value !== 'object' || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (CANVAS_BINARY_FIELDS.includes(key) && typeof child === 'string') {
      if (!child.startsWith(OBJECT_URL_PREFIX)) {
        throw new Error('Portable editor canvas contains an invalid object reference.');
      }
      const assetId = assetPointer(child.slice(OBJECT_URL_PREFIX.length), assetsByObjectId).assetId;
      output[key] = `${ASSET_URL_PREFIX}${assetId}`;
    } else {
      output[key] = restoreCanvasAssets(child, assetsByObjectId);
    }
  }
  return output;
}

export function decodePortableEditorDocument(args: {
  document: PortableEditorDocumentV3;
  assetsByObjectId: ReadonlyMap<string, string>;
}): PersistedEditorDocumentV3 {
  const {
    assets,
    browserFrame: portableBrowserFrame,
    frame: portableFrame,
    sourceImage,
    ...metadata
  } = args.document;
  const { backgroundImage, ...frame } = portableFrame;
  const browserFrame = portableBrowserFrame
    ? (() => {
        const { favicon, ...browserMetadata } = portableBrowserFrame;
        return {
          ...browserMetadata,
          favicon: favicon ? assetPointer(favicon.objectId, args.assetsByObjectId) : null,
        };
      })()
    : undefined;
  const restored: PersistedEditorDocumentV3 = {
    ...metadata,
    assets: assets.map(({ objectId, role }) => ({
      ...assetPointer(objectId, args.assetsByObjectId),
      role,
    })),
    ...(browserFrame ? { browserFrame } : {}),
    canvasJson: JSON.stringify(
      restoreCanvasAssets(JSON.parse(args.document.canvasJson) as unknown, args.assetsByObjectId)
    ),
    frame: {
      ...frame,
      backgroundImage: backgroundImage
        ? assetPointer(backgroundImage.objectId, args.assetsByObjectId)
        : null,
    },
    sourceImage: assetPointer(sourceImage.objectId, args.assetsByObjectId),
  };
  if (!parsePersistedEditorDocument(restored)) {
    throw new Error('Restored editor document is invalid.');
  }
  return restored;
}
