import {
  isEditorVectorDefinition,
  serializeEditorVectorDefinition,
  validateEditorVectorDefinitionDigest,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { parsePersistedEditorDocument } from './parser';
import {
  EDITOR_RASTER_BINARY_FIELDS,
  inspectEditorRasterCanvas,
} from '../../../features/editor/document/raster-state';
// policyStateIds: [] - canvas binary field names are an immutable extraction allowlist;
// per-document maps are operation-local byte/reference indexes and grant no authority.
import type { EditorDocument } from '../../../features/editor/document/types';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import {
  discardPreparedAsset,
  parseAssetRef,
  readAssetFile,
  writeBlobToAsset,
  type AssetRef,
} from '../assets';

import type {
  HydratedEditorDocument,
  PersistedEditorAssetPointer,
  PersistedEditorDocumentAsset,
  PersistedEditorDocument,
  PreparedEditorDocument,
} from './contracts';

export class MissingEditorDocumentAssetError extends Error {
  override name = 'MissingEditorDocumentAssetError';

  constructor(assetId: string, kind: 'ref' | 'source' = 'ref') {
    super(
      kind === 'ref'
        ? `Editor document asset ref is missing: ${assetId}.`
        : `Editor document source image is missing: ${assetId}.`
    );
  }
}

const ASSET_URL_PREFIX = 'sniptale-asset:';
const CANVAS_BINARY_FIELDS = new Set([
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleSimplifySourceData',
  'sniptaleBlurSourceData',
  ...EDITOR_RASTER_BINARY_FIELDS,
]);

function pointer(assetId: string): PersistedEditorAssetPointer {
  return { assetId };
}

function assetUrl(assetId: string): string {
  return `${ASSET_URL_PREFIX}${assetId}`;
}

function assetIdFromUrl(value: string): string | null {
  return value.startsWith(ASSET_URL_PREFIX) && value.length > ASSET_URL_PREFIX.length
    ? value.slice(ASSET_URL_PREFIX.length)
    : null;
}

function assertMetadataHasNoEmbeddedBinary(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (value.startsWith('data:') || value.startsWith('blob:')) {
      throw new Error(`Embedded editor binary is not allowed at ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertMetadataHasNoEmbeddedBinary(child, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    assertMetadataHasNoEmbeddedBinary(child, `${path}.${key}`);
  }
}

async function stageDataUrl(
  binaryUrl: string,
  role: string,
  assets: PersistedEditorDocumentAsset[],
  objects: PreparedEditorDocument['objects'],
  refsById: Map<string, AssetRef>,
  runtimeAssetsByUrl: Map<string, AssetRef>,
  reusableAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef>
): Promise<PersistedEditorAssetPointer> {
  const reusable = runtimeAssetsByUrl.get(binaryUrl) ?? reusableAssetsByRuntimeUrl?.get(binaryUrl);
  if (reusable) {
    refsById.set(reusable.assetId, reusable);
    runtimeAssetsByUrl.set(binaryUrl, reusable);
    assets.push({ assetId: reusable.assetId, role });
    return pointer(reusable.assetId);
  }
  const blob = binaryUrl.startsWith('blob:')
    ? await fetch(binaryUrl).then((response) => {
        if (!response.ok) throw new Error('Editor object URL is unavailable.');
        return response.blob();
      })
    : await dataUrlToBlob(binaryUrl);
  const prepared = await writeBlobToAsset(blob);
  objects.push(prepared);
  refsById.set(prepared.ref.assetId, prepared.ref);
  runtimeAssetsByUrl.set(binaryUrl, prepared.ref);
  assets.push({ assetId: prepared.ref.assetId, role });
  return pointer(prepared.ref.assetId);
}

async function extractCanvasValue(args: {
  assets: PersistedEditorDocumentAsset[];
  objects: PreparedEditorDocument['objects'];
  path: string;
  refsById: Map<string, AssetRef>;
  reusableAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef>;
  runtimeAssetsByUrl: Map<string, AssetRef>;
  value: unknown;
}): Promise<unknown> {
  if (Array.isArray(args.value)) {
    const output: unknown[] = [];
    for (const [index, child] of args.value.entries()) {
      output.push(
        await extractCanvasValue({ ...args, path: `${args.path}[${index}]`, value: child })
      );
    }
    return output;
  }
  if (typeof args.value !== 'object' || args.value === null) return args.value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(args.value)) {
    const path = `${args.path}.${key}`;
    if (
      CANVAS_BINARY_FIELDS.has(key) &&
      typeof child === 'string' &&
      (child.startsWith('data:') || child.startsWith('blob:'))
    ) {
      const staged = await stageDataUrl(
        child,
        `canvas:${path}`,
        args.assets,
        args.objects,
        args.refsById,
        args.runtimeAssetsByUrl,
        args.reusableAssetsByRuntimeUrl
      );
      output[key] = assetUrl(staged.assetId);
    } else {
      output[key] = await extractCanvasValue({ ...args, path, value: child });
    }
  }
  return output;
}

export async function preparePersistedEditorDocument(
  document: EditorDocument,
  options: {
    reusableAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef>;
    reusableAssetsByVectorDefinitionId?: ReadonlyMap<string, AssetRef>;
  } = {}
): Promise<PreparedEditorDocument> {
  const parsedCanvas: unknown = JSON.parse(document.canvasJson);
  const raster = inspectEditorRasterCanvas(
    parsedCanvas,
    (resource, kind): resource is string =>
      isImageDataUrl(resource) && (kind === 'image' || resource.startsWith('data:image/png;'))
  );
  if (!raster.valid || (document.version === 2 && raster.hasRaster)) {
    throw new Error('Editor raster metadata is invalid for document preparation.');
  }
  const assets: PersistedEditorDocumentAsset[] = [];
  const objects: PreparedEditorDocument['objects'] = [];
  const refsById = new Map<string, AssetRef>();
  const runtimeAssetsByUrl = new Map<string, AssetRef>();
  const vectorAssetsByDefinitionId = new Map<string, AssetRef>();
  try {
    const sourceImage = await stageDataUrl(
      document.sourceImageData,
      'source-image',
      assets,
      objects,
      refsById,
      runtimeAssetsByUrl,
      options.reusableAssetsByRuntimeUrl
    );
    const backgroundImage = document.frame.backgroundImageData
      ? await stageDataUrl(
          document.frame.backgroundImageData,
          'frame-background',
          assets,
          objects,
          refsById,
          runtimeAssetsByUrl,
          options.reusableAssetsByRuntimeUrl
        )
      : null;
    const favicon = document.browserFrame?.faviconDataUrl
      ? await stageDataUrl(
          document.browserFrame.faviconDataUrl,
          'browser-favicon',
          assets,
          objects,
          refsById,
          runtimeAssetsByUrl,
          options.reusableAssetsByRuntimeUrl
        )
      : null;
    const canvas = await extractCanvasValue({
      assets,
      objects,
      path: '$',
      refsById,
      ...(options.reusableAssetsByRuntimeUrl
        ? { reusableAssetsByRuntimeUrl: options.reusableAssetsByRuntimeUrl }
        : {}),
      runtimeAssetsByUrl,
      value: parsedCanvas,
    });
    const vectorDefinitions: Record<string, PersistedEditorAssetPointer> = {};
    for (const [id, definition] of Object.entries(
      document.version === 4 ? (document.vectorDefinitions ?? {}) : {}
    )) {
      if (id !== definition.id || !(await validateEditorVectorDefinitionDigest(definition))) {
        throw new Error('Editor vector definition identity is invalid.');
      }
      let ref = options.reusableAssetsByVectorDefinitionId?.get(id);
      if (!ref) {
        const blob = new Blob([serializeEditorVectorDefinition(definition)], {
          type: 'application/json',
        });
        if (blob.size > 8 * 1024 * 1024)
          throw new Error('Editor vector definition exceeds its resource limit.');
        const prepared = await writeBlobToAsset(blob);
        objects.push(prepared);
        ref = prepared.ref;
      }
      refsById.set(ref.assetId, ref);
      vectorAssetsByDefinitionId.set(id, ref);
      vectorDefinitions[id] = pointer(ref.assetId);
      assets.push({ assetId: ref.assetId, role: `vector:${id}` });
    }
    assertMetadataHasNoEmbeddedBinary(canvas);
    assertMetadataHasNoEmbeddedBinary(document.richShapes);
    const { backgroundImageData: _backgroundImageData, ...frame } = document.frame;
    const browserFrame = document.browserFrame
      ? (() => {
          const { faviconDataUrl: _faviconDataUrl, ...metadata } = document.browserFrame;
          return { ...metadata, favicon };
        })()
      : undefined;
    return {
      document: {
        ...(document.version === 4
          ? { version: 5 as const, vectorDefinitions }
          : { version: document.version === 3 ? (4 as const) : (3 as const) }),
        sourceImage,
        ...projectEditorImageMetadata(document),
        frame: { ...frame, backgroundImage },
        ...(browserFrame ? { browserFrame } : {}),
        canvasJson: JSON.stringify(canvas),
        ...(document.richShapes === undefined ? {} : { richShapes: document.richShapes }),
        assets,
      },
      objects,
      refs: [...refsById.values()],
      runtimeAssetsByUrl,
      vectorAssetsByDefinitionId,
    };
  } catch (error) {
    const cleanup = await Promise.allSettled(
      objects.map(({ ref }) => discardPreparedAsset(ref.assetId))
    );
    const failures = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
    if (failures.length > 0) {
      throw new AggregateError(
        [error, ...failures],
        'Editor document preparation and cleanup failed.',
        { cause: error }
      );
    }
    throw error;
  }
}

async function hydrateCanvasValue(
  value: unknown,
  urlsByAssetId: ReadonlyMap<string, string>
): Promise<unknown> {
  if (typeof value === 'string') {
    const assetId = assetIdFromUrl(value);
    return assetId ? (urlsByAssetId.get(assetId) ?? value) : value;
  }
  if (Array.isArray(value))
    return Promise.all(value.map((child) => hydrateCanvasValue(child, urlsByAssetId)));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    await Promise.all(
      Object.entries(value).map(async ([key, child]) => [
        key,
        await hydrateCanvasValue(child, urlsByAssetId),
      ])
    )
  );
}

export async function hydratePersistedEditorDocument(args: {
  document: PersistedEditorDocument;
  refs: readonly unknown[];
  validateVectorDefinition?: (value: unknown) => Promise<EditorVectorDefinition>;
}): Promise<HydratedEditorDocument> {
  if (!parsePersistedEditorDocument(args.document)) {
    throw new Error('Stored editor document is invalid.');
  }
  const refsById = new Map<string, AssetRef>();
  for (const raw of args.refs) {
    const ref = parseAssetRef(raw);
    if (ref) refsById.set(ref.assetId, ref);
  }
  const urls = new Map<string, string>();
  const assetsByRuntimeUrl = new Map<string, AssetRef>();
  const assetsByVectorDefinitionId = new Map<string, AssetRef>();
  const vectorDefinitions: Record<string, EditorVectorDefinition> = {};
  if (args.document.version === 5) {
    for (const [id, pointer] of Object.entries(args.document.vectorDefinitions)) {
      const ref = refsById.get(pointer.assetId);
      if (!ref) throw new MissingEditorDocumentAssetError(pointer.assetId);
      if (ref.mimeType !== 'application/json' || ref.size > 8 * 1024 * 1024)
        throw new Error('Editor vector definition resource is invalid.');
      const file = await readAssetFile(ref, `vector:${id}`);
      if (file.size > 8 * 1024 * 1024)
        throw new Error('Editor vector definition resource exceeds its limit.');
      const value: unknown = JSON.parse(await file.text());
      if (
        !isEditorVectorDefinition(value) ||
        value.id !== id ||
        !(await validateEditorVectorDefinitionDigest(value))
      ) {
        throw new Error('Editor vector definition identity is invalid.');
      }
      const admitted = args.validateVectorDefinition
        ? await args.validateVectorDefinition(value)
        : value;
      if (serializeEditorVectorDefinition(admitted) !== serializeEditorVectorDefinition(value))
        throw new Error('Editor vector validation changed its identity.');
      vectorDefinitions[id] = admitted;
      assetsByVectorDefinitionId.set(id, ref);
    }
  }
  for (const asset of args.document.assets) {
    if (asset.role.startsWith('vector:')) continue;
    if (urls.has(asset.assetId)) continue;
    const ref = refsById.get(asset.assetId);
    if (!ref) throw new MissingEditorDocumentAssetError(asset.assetId);
    const file = await readAssetFile(ref, asset.role);
    const runtimeUrl = await blobToDataUrl(file);
    urls.set(asset.assetId, runtimeUrl);
    assetsByRuntimeUrl.set(runtimeUrl, ref);
  }
  const sourceImageData = urls.get(args.document.sourceImage.assetId);
  if (!sourceImageData) {
    throw new MissingEditorDocumentAssetError(args.document.sourceImage.assetId, 'source');
  }
  const backgroundImageData = args.document.frame.backgroundImage
    ? (urls.get(args.document.frame.backgroundImage.assetId) ?? null)
    : null;
  const faviconDataUrl = args.document.browserFrame?.favicon
    ? (urls.get(args.document.browserFrame.favicon.assetId) ?? null)
    : null;
  const parsedCanvas: unknown = JSON.parse(args.document.canvasJson);
  const canvasJson = JSON.stringify(await hydrateCanvasValue(parsedCanvas, urls));
  const { backgroundImage: _backgroundImage, ...frame } = args.document.frame;
  const browserFrame = args.document.browserFrame
    ? (() => {
        const { favicon: _favicon, ...metadata } = args.document.browserFrame;
        return { ...metadata, faviconDataUrl };
      })()
    : undefined;
  return {
    assetsByRuntimeUrl,
    assetsByVectorDefinitionId,
    document: projectEditorDocument(args.document, {
      backgroundImageData,
      browserFrame,
      canvasJson,
      frame,
      sourceImageData,
      vectorDefinitions,
    }),
    release() {
      urls.clear();
      assetsByRuntimeUrl.clear();
      assetsByVectorDefinitionId.clear();
    },
  };
}

/** Shared scalar metadata only; binary fields and version admission stay at each codec boundary. */
function projectEditorImageMetadata(
  document: Pick<
    EditorDocument,
    | 'compositionBase'
    | 'sourceName'
    | 'displayName'
    | 'sourceWidth'
    | 'sourceHeight'
    | 'canvasWidth'
    | 'canvasHeight'
    | 'sourceLeft'
    | 'sourceTop'
    | 'sourceDisplayWidth'
    | 'sourceDisplayHeight'
  >
) {
  return {
    ...(document.compositionBase ? { compositionBase: { ...document.compositionBase } } : {}),
    sourceName: document.sourceName,
    ...(document.displayName === undefined ? {} : { displayName: document.displayName }),
    sourceWidth: document.sourceWidth,
    sourceHeight: document.sourceHeight,
    canvasWidth: document.canvasWidth,
    canvasHeight: document.canvasHeight,
    sourceLeft: document.sourceLeft,
    sourceTop: document.sourceTop,
    sourceDisplayWidth: document.sourceDisplayWidth,
    sourceDisplayHeight: document.sourceDisplayHeight,
  };
}

function projectEditorDocument(
  document: PersistedEditorDocument,
  hydrated: {
    backgroundImageData: string | null;
    browserFrame: EditorDocument['browserFrame'];
    canvasJson: string;
    frame: Omit<PersistedEditorDocument['frame'], 'backgroundImage'>;
    sourceImageData: string;
    vectorDefinitions: Record<string, EditorVectorDefinition>;
  }
): EditorDocument {
  return {
    ...(document.version === 5
      ? { version: 4 as const, vectorDefinitions: hydrated.vectorDefinitions }
      : { version: document.version === 4 ? (3 as const) : (2 as const) }),
    sourceImageData: hydrated.sourceImageData,
    ...projectEditorImageMetadata(document),
    frame: { ...hydrated.frame, backgroundImageData: hydrated.backgroundImageData },
    ...(hydrated.browserFrame ? { browserFrame: hydrated.browserFrame } : {}),
    canvasJson: hydrated.canvasJson,
    ...(document.richShapes === undefined ? {} : { richShapes: document.richShapes }),
  };
}

export async function materializePersistedEditorDocumentForLegacyTransfer(args: {
  document: PersistedEditorDocument;
  refs: readonly unknown[];
}): Promise<EditorDocument> {
  const hydrated = await hydratePersistedEditorDocument(args);
  try {
    return hydrated.document;
  } finally {
    hydrated.release();
  }
}
