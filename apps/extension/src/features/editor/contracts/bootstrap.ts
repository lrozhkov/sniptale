import type { EditorDocument } from '../document/types';
import { isEditorDocument } from '../document/guards';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  isOptionalNullableString,
  isOptionalString,
  isRecord,
} from '@sniptale/runtime-contracts/validation/primitives';

export interface EditorBootstrapPayload {
  dataUrl: string;
  document?: EditorDocument | null;
  sourceFaviconUrl?: string | null;
  url?: string;
  title?: string;
}

export function isEditorBootstrapPayload(value: unknown): value is EditorBootstrapPayload {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  const dataUrl = value['dataUrl'];
  const document = value['document'];
  return (
    isImageDataUrl(dataUrl) &&
    (document === undefined || document === null || isEditorDocument(document)) &&
    isOptionalNullableString(value['sourceFaviconUrl']) &&
    isOptionalString(value['url']) &&
    isOptionalString(value['title'])
  );
}
export const EDITOR_BOOTSTRAP_QUERY_PARAM = 'bootstrap';
