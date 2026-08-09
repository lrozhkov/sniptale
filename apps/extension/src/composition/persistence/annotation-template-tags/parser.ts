import {
  ANNOTATION_TEMPLATE_TAG_LIMITS,
  type AnnotationTemplateTag,
  type AnnotationTemplateTagState,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { isPlainRecord } from '../infrastructure/guards/primitives';

const ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION = 1;

interface ParsedAnnotationTemplateTagState {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: AnnotationTemplateTagState;
}

export function isUnsafeAnnotationTemplateTagState(
  parsed: ParsedAnnotationTemplateTagState
): boolean {
  return (
    parsed.hasInvalidRoot ||
    parsed.invalidFieldCount > 0 ||
    parsed.value.schemaVersion > ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION
  );
}

export function normalizeAnnotationTemplateTagLabel(label: string): string {
  return label.trim().replace(/\s+/gu, ' ').normalize('NFC');
}

export function parseAnnotationTemplateTagState(value: unknown): ParsedAnnotationTemplateTagState {
  const empty = {
    activeFilterTagIds: [],
    schemaVersion: ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
    tags: [],
  };
  if (value === undefined) return { hasInvalidRoot: false, invalidFieldCount: 0, value: empty };
  if (!isPlainRecord(value)) return { hasInvalidRoot: true, invalidFieldCount: 0, value: empty };
  let invalidFieldCount = 0;
  const schemaVersion = value['schemaVersion'];
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 0) invalidFieldCount++;
  const rawTags = value['tags'];
  const tags: AnnotationTemplateTag[] = [];
  const ids = new Set<string>();
  const labels = new Set<string>();
  if (!Array.isArray(rawTags)) invalidFieldCount++;
  else {
    if (rawTags.length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTags) invalidFieldCount++;
    for (const raw of rawTags.slice(0, ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTags)) {
      const label =
        isPlainRecord(raw) && typeof raw['label'] === 'string'
          ? normalizeAnnotationTemplateTagLabel(raw['label'])
          : '';
      const id = isPlainRecord(raw) && typeof raw['id'] === 'string' ? raw['id'] : '';
      const folded = label.toLowerCase();
      if (
        !id ||
        !label ||
        Array.from(label).length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumLabelLength ||
        ids.has(id) ||
        labels.has(folded)
      ) {
        invalidFieldCount++;
        continue;
      }
      ids.add(id);
      labels.add(folded);
      tags.push({ id, label });
    }
  }
  const activeFilterTagIds: string[] = [];
  const activeSeen = new Set<string>();
  if (!Array.isArray(value['activeFilterTagIds'])) invalidFieldCount++;
  else
    for (const id of value['activeFilterTagIds']) {
      if (typeof id !== 'string' || !ids.has(id) || activeSeen.has(id)) {
        invalidFieldCount++;
        continue;
      }
      activeSeen.add(id);
      activeFilterTagIds.push(id);
    }
  return {
    hasInvalidRoot: false,
    invalidFieldCount,
    value: {
      activeFilterTagIds,
      schemaVersion:
        typeof schemaVersion === 'number' ? schemaVersion : ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
      tags,
    },
  };
}
