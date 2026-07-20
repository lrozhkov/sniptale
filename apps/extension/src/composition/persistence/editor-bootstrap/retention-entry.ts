import { isEditorDocument } from '../../../features/editor/document/guards';
import type { EditorDocument } from '../../../features/editor/document/types';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  isOptionalNullableString,
  isOptionalString,
} from '@sniptale/runtime-contracts/validation/primitives';

const EDITOR_BOOTSTRAP_TTL_MS = 60 * 60 * 1000;

export interface RetainedEditorBootstrapEntry {
  id: string;
  dataUrl: string;
  document?: EditorDocument | null;
  sourceFaviconUrl?: string | null;
  url?: string;
  title?: string;
  createdAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readPersistedBootstrapId(value: unknown, fallbackKey?: IDBValidKey): string | null {
  if (typeof fallbackKey === 'string') {
    return fallbackKey;
  }

  if (isRecord(value) && typeof value['id'] === 'string') {
    return value['id'];
  }

  return null;
}

export function isExpiredBootstrapEntry(entry: RetainedEditorBootstrapEntry, now: number): boolean {
  return entry.createdAt < now - EDITOR_BOOTSTRAP_TTL_MS;
}

export function parseRetainedBootstrapEntry(
  value: unknown,
  expectedId?: string
): RetainedEditorBootstrapEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const document = value['document'];
  const sourceFaviconUrl = value['sourceFaviconUrl'];
  const title = value['title'];
  const url = value['url'];
  const dataUrl = value['dataUrl'];
  if (
    typeof value['id'] !== 'string' ||
    (expectedId !== undefined && value['id'] !== expectedId) ||
    !isImageDataUrl(dataUrl) ||
    typeof value['createdAt'] !== 'number' ||
    !Number.isFinite(value['createdAt']) ||
    !isOptionalNullableString(sourceFaviconUrl) ||
    !isOptionalString(url) ||
    !isOptionalString(title) ||
    (document !== undefined && document !== null && !isEditorDocument(document))
  ) {
    return null;
  }

  return {
    createdAt: value['createdAt'],
    dataUrl,
    ...(document === undefined ? {} : { document }),
    id: value['id'],
    ...(sourceFaviconUrl === undefined ? {} : { sourceFaviconUrl }),
    ...(url === undefined ? {} : { url }),
    ...(title === undefined ? {} : { title }),
  };
}
