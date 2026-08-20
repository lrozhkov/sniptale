// policyStateIds: [] - canvas binary field names are an immutable persisted-data validation
// allowlist; per-document sets are operation-local indexes and grant no authority.
import { isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  PersistedEditorAssetPointer,
  PersistedEditorDocumentAsset,
  PersistedEditorDocumentV3,
} from './contracts';
import { isEditorDocument } from '../../../features/editor/document/guards';

const CANVAS_BINARY_FIELDS = new Set([
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleBlurSourceData',
]);
const ASSET_URL_PREFIX = 'sniptale-asset:';

function parsePointer(value: unknown): PersistedEditorAssetPointer | null {
  return isRecord(value) && isString(value['assetId']) && value['assetId'].length > 0
    ? { assetId: value['assetId'] }
    : null;
}

function containsEmbeddedBinary(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('data:') || value.startsWith('blob:');
  if (Array.isArray(value)) return value.some(containsEmbeddedBinary);
  return isRecord(value) && Object.values(value).some(containsEmbeddedBinary);
}

function hasValidCanvasAssetUrls(value: unknown, declaredIds: ReadonlySet<string>): boolean {
  if (Array.isArray(value))
    return value.every((child) => hasValidCanvasAssetUrls(child, declaredIds));
  if (!isRecord(value)) return true;
  for (const [key, child] of Object.entries(value)) {
    if (CANVAS_BINARY_FIELDS.has(key) && typeof child === 'string') {
      if (
        !child.startsWith(ASSET_URL_PREFIX) ||
        !declaredIds.has(child.slice(ASSET_URL_PREFIX.length))
      ) {
        return false;
      }
    }
    if (!hasValidCanvasAssetUrls(child, declaredIds)) return false;
  }
  return true;
}

export function parsePersistedEditorDocument(value: unknown): PersistedEditorDocumentV3 | null {
  if (!isRecord(value) || value['version'] !== 3 || !Array.isArray(value['assets'])) return null;
  const sourceImage = parsePointer(value['sourceImage']);
  const frame = value['frame'];
  const browserFrame = value['browserFrame'];
  if (!sourceImage || !isRecord(frame) || (browserFrame !== undefined && !isRecord(browserFrame)))
    return null;
  const backgroundImage =
    frame['backgroundImage'] === null ? null : parsePointer(frame['backgroundImage']);
  const favicon =
    browserFrame?.['favicon'] === null ? null : parsePointer(browserFrame?.['favicon']);
  if (backgroundImage === null && frame['backgroundImage'] !== null) return null;
  if (browserFrame && favicon === null && browserFrame['favicon'] !== null) return null;
  const assets: PersistedEditorDocumentAsset[] = [];
  const seenRoles = new Set<string>();
  for (const raw of value['assets']) {
    const parsed = parsePointer(raw);
    if (
      !parsed ||
      !isRecord(raw) ||
      !isString(raw['role']) ||
      raw['role'].length === 0 ||
      seenRoles.has(raw['role'])
    )
      return null;
    seenRoles.add(raw['role']);
    assets.push({ ...parsed, role: raw['role'] });
  }
  const declaredIds = new Set(assets.map((asset) => asset.assetId));
  if (!declaredIds.has(sourceImage.assetId)) return null;
  if (backgroundImage && !declaredIds.has(backgroundImage.assetId)) return null;
  if (favicon && !declaredIds.has(favicon.assetId)) return null;
  if (!isString(value['canvasJson'])) return null;
  let canvas: unknown;
  try {
    canvas = JSON.parse(value['canvasJson']);
    if (containsEmbeddedBinary(canvas) || !hasValidCanvasAssetUrls(canvas, declaredIds))
      return null;
  } catch {
    return null;
  }
  if (containsEmbeddedBinary(value)) return null;
  const { backgroundImage: _backgroundImage, ...frameMetadata } = frame;
  const browserMetadata = browserFrame
    ? (() => {
        const { favicon: _favicon, ...metadata } = browserFrame;
        return { ...metadata, faviconDataUrl: null };
      })()
    : undefined;
  if (
    !isEditorDocument({
      ...value,
      version: 2,
      sourceImageData: 'data:image/png;base64,AA==',
      frame: { ...frameMetadata, backgroundImageData: null },
      ...(browserMetadata ? { browserFrame: browserMetadata } : {}),
    })
  ) {
    return null;
  }
  return value as unknown as PersistedEditorDocumentV3;
}
