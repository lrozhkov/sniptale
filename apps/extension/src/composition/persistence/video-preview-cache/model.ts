import { isSha256Digest } from '@sniptale/platform/security/digest';

import { VIDEO_PREVIEW_CACHE_MAX_BYTES } from './constants';

export const VIDEO_PREVIEW_CACHE_SCHEMA_VERSION = 2 as const;
export const VIDEO_PREVIEW_CACHE_MIME_TYPE = 'video/mp4' as const;
const AVC_CODEC_PATTERN = /^avc1\.[a-f0-9]{6}$/iu;

export interface VideoPreviewCacheRange {
  endFrame: number;
  startFrame: number;
}

export interface VideoPreviewCacheSegment {
  blob: Blob;
  endFrame: number;
  fingerprint: string;
  index: number;
  startFrame: number;
}

export interface VideoPreviewCacheRecord {
  byteLength: number;
  codec: string;
  contentRevision: string;
  createdAt: number;
  fps: number;
  height: number;
  lastAccessedAt: number;
  mimeType: typeof VIDEO_PREVIEW_CACHE_MIME_TYPE;
  projectId: string;
  range: VideoPreviewCacheRange;
  schemaVersion: typeof VIDEO_PREVIEW_CACHE_SCHEMA_VERSION;
  segments: VideoPreviewCacheSegment[];
  storageKey: string;
  width: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function parseRange(value: unknown): VideoPreviewCacheRange | null {
  if (!isRecord(value)) return null;
  const startFrame = value['startFrame'];
  const endFrame = value['endFrame'];
  return isSafeNonNegativeInteger(startFrame) &&
    isSafeNonNegativeInteger(endFrame) &&
    startFrame < endFrame
    ? { endFrame, startFrame }
    : null;
}

function parseSegment(
  value: unknown,
  range: VideoPreviewCacheRange
): VideoPreviewCacheSegment | null {
  if (!isRecord(value)) return null;
  const blob = value['blob'];
  const startFrame = value['startFrame'];
  const endFrame = value['endFrame'];
  const fingerprint = value['fingerprint'];
  const index = value['index'];
  if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > VIDEO_PREVIEW_CACHE_MAX_BYTES)
    return null;
  if (blob.type !== VIDEO_PREVIEW_CACHE_MIME_TYPE) return null;
  if (!isSafeNonNegativeInteger(startFrame) || !isSafeNonNegativeInteger(endFrame)) return null;
  if (startFrame >= endFrame || startFrame < range.startFrame || endFrame > range.endFrame)
    return null;
  if (typeof fingerprint !== 'string' || !isSha256Digest(fingerprint)) return null;
  if (!isSafeNonNegativeInteger(index)) return null;
  return { blob, endFrame, fingerprint, index, startFrame };
}

function parseSegments(
  value: unknown,
  range: VideoPreviewCacheRange
): VideoPreviewCacheSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments: VideoPreviewCacheSegment[] = [];
  const indexes = new Set<number>();
  for (const rawSegment of value) {
    const segment = parseSegment(rawSegment, range);
    if (!segment || indexes.has(segment.index)) return null;
    indexes.add(segment.index);
    segments.push(segment);
  }
  segments.sort((left, right) => left.index - right.index);
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index]!.startFrame < segments[index - 1]!.endFrame) return null;
  }
  return segments;
}

function isValidRasterDimension(value: unknown): value is number {
  return isSafeNonNegativeInteger(value) && value > 0 && value <= 4096 && value % 2 === 0;
}

export function isVideoPreviewCacheCodec(value: unknown): value is string {
  return typeof value === 'string' && AVC_CODEC_PATTERN.test(value);
}

export function createVideoPreviewCacheMediaType(codec: string): string {
  if (!isVideoPreviewCacheCodec(codec)) throw new Error('Invalid video preview cache codec');
  return `${VIDEO_PREVIEW_CACHE_MIME_TYPE}; codecs="${codec}"`;
}

function parseRecordMetadata(value: Record<string, unknown>) {
  const range = parseRange(value['range']);
  if (
    !range ||
    !isValidRasterDimension(value['width']) ||
    !isValidRasterDimension(value['height'])
  ) {
    return null;
  }
  if (value['width'] * value['height'] > 3840 * 2160) return null;
  const fps = value['fps'];
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0 || fps > 240) return null;
  const createdAt = value['createdAt'];
  const lastAccessedAt = value['lastAccessedAt'];
  if (!isSafeNonNegativeInteger(createdAt) || !isSafeNonNegativeInteger(lastAccessedAt))
    return null;
  if (lastAccessedAt < createdAt) return null;
  return { createdAt, fps, height: value['height'], lastAccessedAt, range, width: value['width'] };
}

export function parseVideoPreviewCacheRecord(value: unknown): VideoPreviewCacheRecord | null {
  if (!isRecord(value)) return null;
  const metadata = parseRecordMetadata(value);
  if (!metadata) return null;
  const projectId = value['projectId'];
  const storageKey = value['storageKey'];
  const contentRevision = value['contentRevision'];
  if (typeof projectId !== 'string' || projectId.length === 0 || projectId.length > 512)
    return null;
  if (typeof storageKey !== 'string' || !isSha256Digest(storageKey)) return null;
  if (typeof contentRevision !== 'string' || !isSha256Digest(contentRevision)) return null;
  if (value['schemaVersion'] !== VIDEO_PREVIEW_CACHE_SCHEMA_VERSION) return null;
  if (
    !isVideoPreviewCacheCodec(value['codec']) ||
    value['mimeType'] !== VIDEO_PREVIEW_CACHE_MIME_TYPE
  ) {
    return null;
  }
  const segments = parseSegments(value['segments'], metadata.range);
  if (!segments) return null;
  const byteLength = segments.reduce((sum, segment) => sum + segment.blob.size, 0);
  if (!Number.isSafeInteger(byteLength) || byteLength > VIDEO_PREVIEW_CACHE_MAX_BYTES) return null;
  return {
    ...metadata,
    byteLength,
    codec: value['codec'],
    contentRevision,
    mimeType: VIDEO_PREVIEW_CACHE_MIME_TYPE,
    projectId,
    schemaVersion: VIDEO_PREVIEW_CACHE_SCHEMA_VERSION,
    segments,
    storageKey,
  };
}

export function readVideoPreviewCacheProjectId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const projectId = value['projectId'];
  return typeof projectId === 'string' && projectId.length > 0 && projectId.length <= 512
    ? projectId
    : null;
}
