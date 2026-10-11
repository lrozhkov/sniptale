import { parseWindowHeader } from '../../../features/browser-frame/header';
import type { ArchiveRootDescriptor } from '../../../composition/archive-transfer';
import type { JsonValue } from './contracts';
import { MediaBackupFailure } from './errors';

function record(value: JsonValue | undefined): { [key: string]: JsonValue } | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

/** Enumerates only owner-defined header slots, including the retained redo suffix. */
export function mapBackupHeaders(
  metadata: JsonValue,
  descriptor: ArchiveRootDescriptor,
  transform: (header: { [key: string]: JsonValue }) => JsonValue,
  phase: 'encode' | 'read' = 'encode'
): JsonValue {
  const output = structuredClone(metadata);
  const root = record(output);
  if (!root) return output;
  const content = (value: JsonValue | undefined) => {
    const state = record(value);
    if (state && state['windowHeader'] !== undefined) {
      const header = record(state['windowHeader']);
      if (!header)
        throw new MediaBackupFailure('resource-invalid', phase, {}, undefined, 'favicon');
      state['windowHeader'] = transform(header);
    }
  };
  const review = (value: JsonValue | undefined) => {
    const workspace = record(record(value)?.['workspace']);
    if (!workspace) return;
    content(workspace['advanced']);
    if (Array.isArray(workspace['history'])) {
      for (const item of workspace['history']) {
        const operation = record(item);
        if (operation?.['target'] === 'advancedContent') {
          content(operation['before']);
          content(operation['after']);
        }
      }
    }
  };
  if (descriptor.rootKind === 'media' && descriptor.mediaSubtype === 'library-item')
    review(root['videoReview']);
  if (descriptor.rootKind === 'video-project') {
    const project = record(record(root['entry'])?.['project']);
    if (Array.isArray(project?.['clips'])) for (const clip of project['clips']) content(clip);
    for (const key of ['projectAssets', 'projectExports']) {
      const items = root[key];
      if (Array.isArray(items)) for (const item of items) review(record(item)?.['videoReview']);
    }
  }
  return output;
}

export function encodeBackupHeader(
  header: { [key: string]: JsonValue },
  addPng: (dataUrl: string) => string
): JsonValue {
  const parsed = parseWindowHeader(header);
  if (!parsed || 'faviconObjectId' in header)
    throw new MediaBackupFailure('resource-invalid', 'encode', {}, undefined, 'favicon');
  const { faviconDataUrl, ...rest } = parsed;
  return { ...rest, ...(faviconDataUrl ? { faviconObjectId: addPng(faviconDataUrl) } : {}) };
}

export function decodeBackupHeader(
  header: { [key: string]: JsonValue },
  images: ReadonlyMap<string, string>
): JsonValue {
  const { faviconObjectId, ...rest } = header;
  if (
    'faviconDataUrl' in rest ||
    (faviconObjectId !== undefined && typeof faviconObjectId !== 'string')
  )
    throw new MediaBackupFailure('resource-invalid', 'read', {}, undefined, 'favicon');
  const faviconDataUrl =
    typeof faviconObjectId === 'string' ? images.get(faviconObjectId) : undefined;
  if (faviconObjectId !== undefined && !faviconDataUrl)
    throw new MediaBackupFailure('resource-invalid', 'read', {}, undefined, 'favicon');
  const parsed = parseWindowHeader({ ...rest, ...(faviconDataUrl ? { faviconDataUrl } : {}) });
  if (!parsed) throw new MediaBackupFailure('resource-invalid', 'read', {}, undefined, 'favicon');
  return { ...parsed };
}
