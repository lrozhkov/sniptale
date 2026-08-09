import { ANNOTATION_TEMPLATE_TAG_LIMITS } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';

export function parseAnnotationTemplateTagIds(value: unknown): {
  invalid: boolean;
  value: string[];
} {
  if (value === undefined) return { invalid: false, value: [] };
  if (!Array.isArray(value)) return { invalid: true, value: [] };
  const ids: string[] = [];
  const seen = new Set<string>();
  let invalid = value.length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTagsPerTemplate;
  for (const id of value.slice(0, ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTagsPerTemplate)) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      invalid = true;
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return { invalid, value: ids };
}
