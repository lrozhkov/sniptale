import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  EDITOR_RASTER_BINARY_FIELDS,
  inspectEditorRasterCanvas,
} from '../../../../features/editor/document/raster-state';
import type { PersistedEditorDocument } from '../../../../composition/persistence/document-assets';
import { parsePersistedEditorDocument } from '../../../../composition/persistence/document-assets/parser';

const ASSET_URL_PREFIX = 'sniptale-asset:';
const OBJECT_URL_PREFIX = 'sniptale-object:';
const CANVAS_BINARY_FIELDS: readonly string[] = [
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleSimplifySourceData',
  'sniptaleBlurSourceData',
  ...EDITOR_RASTER_BINARY_FIELDS,
];

interface PortableEditorAssetPointer {
  objectId: string;
}

export interface PortableEditorDocument extends Omit<
  PersistedEditorDocument,
  'assets' | 'browserFrame' | 'frame' | 'sourceImage'
> {
  assets: Array<PortableEditorAssetPointer & { role: string }>;
  sourceImage: PortableEditorAssetPointer;
  frame: Omit<PersistedEditorDocument['frame'], 'backgroundImage'> & {
    backgroundImage: PortableEditorAssetPointer | null;
  };
  browserFrame?:
    | (Omit<NonNullable<PersistedEditorDocument['browserFrame']>, 'favicon'> & {
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
  document: PersistedEditorDocument;
  objectsByAssetId: ReadonlyMap<string, string>;
}): PortableEditorDocument {
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

/** Decode untrusted archive metadata before any document resource is staged. */
export function decodePortableEditorDocument(args: {
  document: unknown;
  assetsByObjectId: ReadonlyMap<string, string>;
}): PersistedEditorDocument {
  if (
    !isRecord(args.document) ||
    !Array.isArray(args.document['assets']) ||
    !isRecord(args.document['frame']) ||
    typeof args.document['canvasJson'] !== 'string'
  ) {
    throw new Error('Portable editor document is invalid.');
  }
  const {
    assets,
    browserFrame: portableBrowserFrame,
    frame: portableFrame,
    sourceImage,
    ...metadata
  } = args.document;
  const restorePointer = (value: unknown) => {
    if (!isRecord(value) || typeof value['objectId'] !== 'string') {
      throw new Error('Portable editor document pointer is invalid.');
    }
    return assetPointer(value['objectId'], args.assetsByObjectId);
  };
  const { backgroundImage, ...frame } = portableFrame;
  let browserFrame: Record<string, unknown> | undefined;
  if (portableBrowserFrame !== undefined) {
    if (!isRecord(portableBrowserFrame))
      throw new Error('Portable editor browser frame is invalid.');
    const { favicon, ...browserMetadata } = portableBrowserFrame;
    browserFrame = {
      ...browserMetadata,
      favicon: favicon === null ? null : restorePointer(favicon),
    };
  }
  const canvas: unknown = JSON.parse(args.document['canvasJson']);
  const raster = inspectEditorRasterCanvas(
    canvas,
    (resource): resource is string =>
      typeof resource === 'string' &&
      resource.startsWith(OBJECT_URL_PREFIX) &&
      args.assetsByObjectId.has(resource.slice(OBJECT_URL_PREFIX.length))
  );
  if (!raster.valid) throw new Error('Portable editor raster metadata is invalid.');
  const restored = {
    ...metadata,
    assets: assets.map((asset: unknown) => {
      if (!isRecord(asset) || typeof asset['role'] !== 'string') {
        throw new Error('Portable editor document asset is invalid.');
      }
      return { ...restorePointer(asset), role: asset['role'] };
    }),
    ...(browserFrame ? { browserFrame } : {}),
    canvasJson: JSON.stringify(restoreCanvasAssets(canvas, args.assetsByObjectId)),
    frame: {
      ...frame,
      backgroundImage: backgroundImage === null ? null : restorePointer(backgroundImage),
    },
    sourceImage: restorePointer(sourceImage),
  };
  const parsed = parsePersistedEditorDocument(restored);
  if (!parsed) throw new Error('Restored editor document is invalid.');
  return parsed;
}

/** Admit the portable document against its declared objects before restore staging. */
export function assertPortableEditorDocument(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value['assets'])) {
    throw new Error('Portable editor document is invalid.');
  }
  const declared = new Map<string, string>();
  for (const asset of value['assets']) {
    if (!isRecord(asset) || typeof asset['objectId'] !== 'string') {
      throw new Error('Portable editor document asset is invalid.');
    }
    declared.set(asset['objectId'], asset['objectId']);
  }
  decodePortableEditorDocument({ document: value, assetsByObjectId: declared });
}
