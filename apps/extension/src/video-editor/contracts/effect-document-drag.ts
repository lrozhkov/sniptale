export const VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME = 'application/x-sniptale-effect-document+json';

export interface VideoEditorEffectDocumentDragPayload {
  documentId: string;
  kind: 'standalone' | 'targetEffect' | 'transition';
  packId: string;
}

export type VideoEditorEffectDocumentDataTransfer = Pick<
  DataTransfer,
  'dropEffect' | 'effectAllowed' | 'getData' | 'setData' | 'types'
>;

const MAX_DRAG_PAYLOAD_LENGTH = 1_024;
const MAX_ID_LENGTH = 256;

export function writeVideoEditorEffectDocumentDragPayload(
  dataTransfer: VideoEditorEffectDocumentDataTransfer,
  payload: VideoEditorEffectDocumentDragPayload
): void {
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME, JSON.stringify(payload));
}

export function readVideoEditorEffectDocumentDragPayload(
  dataTransfer: VideoEditorEffectDocumentDataTransfer
): VideoEditorEffectDocumentDragPayload | null {
  const source = dataTransfer.getData(VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME);
  if (source.length === 0 || source.length > MAX_DRAG_PAYLOAD_LENGTH) return null;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isRecord(value) || Object.keys(value).length !== 3) return null;
  const { documentId, kind, packId } = value;
  if (!isBoundedId(documentId) || !isBoundedId(packId) || !isEffectKind(kind)) return null;
  return { documentId, kind, packId };
}

export function hasVideoEditorEffectDocumentDragType(
  dataTransfer: Pick<DataTransfer, 'types'>
): boolean {
  return Array.from(dataTransfer.types).includes(VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isEffectKind(value: unknown): value is VideoEditorEffectDocumentDragPayload['kind'] {
  return value === 'standalone' || value === 'targetEffect' || value === 'transition';
}
