import {
  ANNOTATION_TEMPLATE_TAG_LIMITS,
  SYSTEM_ANNOTATION_TEMPLATE_TAG_KEYS,
  type AnnotationTemplateTag,
  type AnnotationTemplateTagState,
  type SystemAnnotationTemplateTagKey,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { isPlainRecord } from '../infrastructure/guards/primitives';
import {
  createSystemAnnotationTemplateTags,
  getCanonicalSystemAnnotationTemplateTag,
  isCanonicalSystemAnnotationTemplateTagLabel,
  SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
} from './system-tags';

const ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION = 2;

interface ParsedAnnotationTemplateTagState {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  sourceSchemaVersion: number;
  value: AnnotationTemplateTagState;
}

export function isUnsafeAnnotationTemplateTagState(
  parsed: ParsedAnnotationTemplateTagState
): boolean {
  return (
    parsed.hasInvalidRoot ||
    parsed.invalidFieldCount > 0 ||
    parsed.sourceSchemaVersion > ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION
  );
}

export function normalizeAnnotationTemplateTagLabel(label: string): string {
  return label.trim().replace(/\s+/gu, ' ').normalize('NFC');
}

function isSystemTagKey(value: unknown): value is SystemAnnotationTemplateTagKey {
  return (
    typeof value === 'string' &&
    (SYSTEM_ANNOTATION_TEMPLATE_TAG_KEYS as readonly string[]).includes(value)
  );
}

function parseTag(raw: unknown, legacy: boolean): AnnotationTemplateTag | null {
  if (!isPlainRecord(raw)) return null;
  const label =
    typeof raw['label'] === 'string' ? normalizeAnnotationTemplateTagLabel(raw['label']) : '';
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  if (
    !id ||
    !label ||
    Array.from(label).length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumLabelLength
  ) {
    return null;
  }
  if (legacy || raw['origin'] === undefined) return { id, label, origin: 'user' };
  if (raw['origin'] === 'user') return { id, label, origin: 'user' };
  if (
    raw['origin'] !== 'system' ||
    !isSystemTagKey(raw['systemTagKey']) ||
    !Number.isInteger(raw['basedOnRevision']) ||
    typeof raw['customized'] !== 'boolean'
  ) {
    return null;
  }
  const canonical = getCanonicalSystemAnnotationTemplateTag(raw['systemTagKey']);
  const customized = label !== canonical.label;
  if (
    id !== canonical.id ||
    raw['customized'] !== customized ||
    (raw['basedOnRevision'] as number) > SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION
  ) {
    return null;
  }
  return {
    ...canonical,
    basedOnRevision: raw['basedOnRevision'] as number,
    customized,
    label,
  };
}

function allocateLegacyUserLabel(label: string, labels: ReadonlySet<string>): string | null {
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const ending = suffix === 1 ? ' (user)' : ` (user ${suffix})`;
    const available = ANNOTATION_TEMPLATE_TAG_LIMITS.maximumLabelLength - ending.length;
    const candidate = `${Array.from(label).slice(0, available).join('')}${ending}`;
    if (!labels.has(candidate.toLowerCase())) return candidate;
  }
  return null;
}

export function parseAnnotationTemplateTagState(value: unknown): ParsedAnnotationTemplateTagState {
  const systemTags = createSystemAnnotationTemplateTags();
  const empty = {
    activeFilterTagIds: systemTags.map((tag) => tag.id),
    schemaVersion: ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
    tags: systemTags,
  };
  if (value === undefined) {
    return {
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      sourceSchemaVersion: ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
      value: empty,
    };
  }
  if (!isPlainRecord(value)) {
    return {
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      sourceSchemaVersion: ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
      value: empty,
    };
  }
  let invalidFieldCount = 0;
  const schemaVersion = value['schemaVersion'];
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 0) invalidFieldCount++;
  const rawTags = value['tags'];
  const tags: AnnotationTemplateTag[] = createSystemAnnotationTemplateTags();
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const tag of tags) {
    ids.add(tag.id);
    labels.add(tag.label.toLowerCase());
  }
  if (!Array.isArray(rawTags)) invalidFieldCount++;
  else {
    if (rawTags.length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTags) invalidFieldCount++;
    const legacy = schemaVersion === 1;
    for (const raw of rawTags.slice(0, ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTags)) {
      let parsed = parseTag(raw, legacy);
      if (parsed?.origin === 'system') {
        const systemTag = parsed;
        const index = tags.findIndex((tag) => tag.id === systemTag.id);
        const folded = systemTag.label.toLowerCase();
        const canonicalFolded = tags[index]!.label.toLowerCase();
        if (labels.has(folded) && folded !== canonicalFolded) {
          invalidFieldCount++;
          continue;
        }
        labels.delete(canonicalFolded);
        labels.add(folded);
        tags[index] = {
          ...systemTag,
          basedOnRevision: SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
        };
        continue;
      }
      const folded = parsed?.label.toLowerCase() ?? '';
      if (
        parsed?.origin === 'user' &&
        legacy &&
        labels.has(folded) &&
        isCanonicalSystemAnnotationTemplateTagLabel(parsed.label)
      ) {
        const migratedLabel = allocateLegacyUserLabel(parsed.label, labels);
        parsed = migratedLabel ? { ...parsed, label: migratedLabel } : null;
      }
      const migratedFolded = parsed?.label.toLowerCase() ?? '';
      if (!parsed || ids.has(parsed.id) || labels.has(migratedFolded)) {
        invalidFieldCount++;
        continue;
      }
      ids.add(parsed.id);
      labels.add(migratedFolded);
      tags.push(parsed);
    }
  }
  const activeFilterTagIds: string[] = [];
  const activeSeen = new Set<string>();
  if (!Array.isArray(value['activeFilterTagIds'])) {
    invalidFieldCount++;
    for (const tag of createSystemAnnotationTemplateTags()) {
      activeSeen.add(tag.id);
      activeFilterTagIds.push(tag.id);
    }
  } else
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
    sourceSchemaVersion:
      typeof schemaVersion === 'number' ? schemaVersion : ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
    value: {
      activeFilterTagIds,
      schemaVersion: ANNOTATION_TEMPLATE_TAG_SCHEMA_VERSION,
      tags,
    },
  };
}
