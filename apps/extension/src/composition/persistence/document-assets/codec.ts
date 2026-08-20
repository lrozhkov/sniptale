// policyStateIds: [] - canvas binary field names are an immutable extraction allowlist;
// per-document maps are operation-local byte/reference indexes and grant no authority.
import type { EditorDocument } from '../../../features/editor/document/types';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { parseAssetRef, readAssetFile, writeBlobToAsset, type AssetRef } from '../assets';
import type {
  HydratedEditorDocument,
  PersistedEditorAssetPointer,
  PersistedEditorDocumentAsset,
  PersistedEditorDocumentV3,
  PreparedEditorDocument,
} from './contracts';

const ASSET_URL_PREFIX = 'sniptale-asset:';
const CANVAS_BINARY_FIELDS = new Set([
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleBlurSourceData',
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
  const reusable = reusableAssetsByRuntimeUrl?.get(binaryUrl);
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
  options: { reusableAssetsByRuntimeUrl?: ReadonlyMap<string, AssetRef> } = {}
): Promise<PreparedEditorDocument> {
  const assets: PersistedEditorDocumentAsset[] = [];
  const objects: PreparedEditorDocument['objects'] = [];
  const refsById = new Map<string, AssetRef>();
  const runtimeAssetsByUrl = new Map<string, AssetRef>();
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
    const parsedCanvas: unknown = JSON.parse(document.canvasJson);
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
        version: 3,
        sourceImage,
        sourceName: document.sourceName,
        sourceWidth: document.sourceWidth,
        sourceHeight: document.sourceHeight,
        canvasWidth: document.canvasWidth,
        canvasHeight: document.canvasHeight,
        sourceLeft: document.sourceLeft,
        sourceTop: document.sourceTop,
        sourceDisplayWidth: document.sourceDisplayWidth,
        sourceDisplayHeight: document.sourceDisplayHeight,
        frame: { ...frame, backgroundImage },
        ...(browserFrame ? { browserFrame } : {}),
        canvasJson: JSON.stringify(canvas),
        ...(document.richShapes === undefined ? {} : { richShapes: document.richShapes }),
        assets,
      },
      objects,
      refs: [...refsById.values()],
      runtimeAssetsByUrl,
    };
  } catch (error) {
    const cleanup = await Promise.allSettled(
      objects.map(({ ref }) =>
        import('../assets').then(({ discardPreparedAsset }) => discardPreparedAsset(ref.assetId))
      )
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
  document: PersistedEditorDocumentV3;
  refs: readonly unknown[];
}): Promise<HydratedEditorDocument> {
  const refsById = new Map<string, AssetRef>();
  for (const raw of args.refs) {
    const ref = parseAssetRef(raw);
    if (ref) refsById.set(ref.assetId, ref);
  }
  const urls = new Map<string, string>();
  const assetsByRuntimeUrl = new Map<string, AssetRef>();
  try {
    for (const asset of args.document.assets) {
      if (urls.has(asset.assetId)) continue;
      const ref = refsById.get(asset.assetId);
      if (!ref) throw new Error(`Editor document asset ref is missing: ${asset.assetId}.`);
      const file = await readAssetFile(ref, asset.role);
      const runtimeUrl = URL.createObjectURL(file);
      urls.set(asset.assetId, runtimeUrl);
      assetsByRuntimeUrl.set(runtimeUrl, ref);
    }
    const sourceImageData = urls.get(args.document.sourceImage.assetId);
    if (!sourceImageData) throw new Error('Editor document source image is missing.');
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
      document: {
        version: 2,
        sourceImageData,
        sourceName: args.document.sourceName,
        sourceWidth: args.document.sourceWidth,
        sourceHeight: args.document.sourceHeight,
        canvasWidth: args.document.canvasWidth,
        canvasHeight: args.document.canvasHeight,
        sourceLeft: args.document.sourceLeft,
        sourceTop: args.document.sourceTop,
        sourceDisplayWidth: args.document.sourceDisplayWidth,
        sourceDisplayHeight: args.document.sourceDisplayHeight,
        frame: { ...frame, backgroundImageData },
        ...(browserFrame ? { browserFrame } : {}),
        canvasJson,
        ...(args.document.richShapes === undefined ? {} : { richShapes: args.document.richShapes }),
      },
      release() {
        for (const url of urls.values()) URL.revokeObjectURL(url);
        urls.clear();
        assetsByRuntimeUrl.clear();
      },
    };
  } catch (error) {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    throw error;
  }
}

export async function materializePersistedEditorDocumentForLegacyTransfer(args: {
  document: PersistedEditorDocumentV3;
  refs: readonly unknown[];
}): Promise<EditorDocument> {
  const refsById = new Map<string, AssetRef>();
  for (const raw of args.refs) {
    const ref = parseAssetRef(raw);
    if (ref) refsById.set(ref.assetId, ref);
  }
  const dataUrls = new Map<string, string>();
  for (const asset of args.document.assets) {
    const ref = refsById.get(asset.assetId);
    if (!ref) throw new Error(`Editor document asset ref is missing: ${asset.assetId}.`);
    dataUrls.set(asset.assetId, await blobToDataUrl(await readAssetFile(ref, asset.role)));
  }
  const sourceImageData = dataUrls.get(args.document.sourceImage.assetId);
  if (!sourceImageData) throw new Error('Editor document source image is missing.');
  const { backgroundImage: _backgroundImage, ...frame } = args.document.frame;
  const { browserFrame: storedBrowserFrame } = args.document;
  const browserFrame = storedBrowserFrame
    ? (() => {
        const { favicon: _favicon, ...metadata } = storedBrowserFrame;
        return {
          ...metadata,
          faviconDataUrl: storedBrowserFrame.favicon
            ? (dataUrls.get(storedBrowserFrame.favicon.assetId) ?? null)
            : null,
        };
      })()
    : undefined;
  return {
    version: 2,
    sourceImageData,
    sourceName: args.document.sourceName,
    sourceWidth: args.document.sourceWidth,
    sourceHeight: args.document.sourceHeight,
    canvasWidth: args.document.canvasWidth,
    canvasHeight: args.document.canvasHeight,
    sourceLeft: args.document.sourceLeft,
    sourceTop: args.document.sourceTop,
    sourceDisplayWidth: args.document.sourceDisplayWidth,
    sourceDisplayHeight: args.document.sourceDisplayHeight,
    frame: {
      ...frame,
      backgroundImageData: args.document.frame.backgroundImage
        ? (dataUrls.get(args.document.frame.backgroundImage.assetId) ?? null)
        : null,
    },
    ...(browserFrame ? { browserFrame } : {}),
    canvasJson: JSON.stringify(
      await hydrateCanvasValue(JSON.parse(args.document.canvasJson) as unknown, dataUrls)
    ),
    ...(args.document.richShapes === undefined ? {} : { richShapes: args.document.richShapes }),
  };
}
