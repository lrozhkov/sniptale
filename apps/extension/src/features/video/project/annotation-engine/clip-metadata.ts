import { getLegacyAnnotationTemplateRef } from './legacy';
import {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplateControlValues,
  type VideoAnnotationTemplateRef,
  type VideoAnnotationTemplateSnapshot,
} from './types';
import type { VideoProjectAnnotationClip } from '../types/model';
import type { VideoOverlayTemplateKind } from '../types/templates';

interface NormalizedAnnotationTemplateMetadata {
  templateControlValues?: VideoAnnotationTemplateControlValues;
  templateRef: VideoAnnotationTemplateRef;
  templateSnapshot?: VideoAnnotationTemplateSnapshot;
}

export function normalizeAnnotationTemplateMetadata(
  clip: VideoProjectAnnotationClip,
  templateKind: VideoOverlayTemplateKind
): NormalizedAnnotationTemplateMetadata {
  const templateControlValues = normalizeTemplateControlValues(clip.templateControlValues);
  const templateSnapshot = normalizeTemplateSnapshot(clip.templateSnapshot);

  return {
    templateRef:
      normalizeTemplateRef(clip.templateRef) ?? getLegacyAnnotationTemplateRef(templateKind),
    ...(templateControlValues ? { templateControlValues } : {}),
    ...(templateSnapshot ? { templateSnapshot } : {}),
  };
}

function normalizeTemplateRef(
  ref: VideoProjectAnnotationClip['templateRef']
): VideoAnnotationTemplateRef | undefined {
  return typeof ref?.packId === 'string' &&
    ref.packId.length > 0 &&
    typeof ref.templateId === 'string' &&
    ref.templateId.length > 0
    ? { packId: ref.packId, templateId: ref.templateId }
    : undefined;
}

function normalizeTemplateControlValues(
  values: VideoProjectAnnotationClip['templateControlValues']
): VideoAnnotationTemplateControlValues | undefined {
  if (!values || typeof values !== 'object') {
    return undefined;
  }

  const entries = Object.entries(values).filter(
    (entry): entry is [string, VideoAnnotationPrimitiveValue] =>
      typeof entry[0] === 'string' && isPrimitiveControlValue(entry[1])
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeTemplateSnapshot(
  snapshot: VideoProjectAnnotationClip['templateSnapshot']
): VideoAnnotationTemplateSnapshot | undefined {
  const templateRef = normalizeTemplateRef(snapshot?.templateRef);
  if (snapshot?.capturedAtSchemaVersion !== VIDEO_ANNOTATION_PACK_SCHEMA_VERSION || !templateRef) {
    return undefined;
  }

  return {
    capturedAtSchemaVersion: VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
    controls: normalizeTemplateControlValues(snapshot.controls) ?? {},
    ...(snapshot.packLabel ? { packLabel: snapshot.packLabel } : {}),
    ...(snapshot.template ? { template: snapshot.template } : {}),
    templateRef,
  };
}

function isPrimitiveControlValue(value: unknown): value is VideoAnnotationPrimitiveValue {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  );
}
