const MAX_ANNOTATION_TEMPLATE_TAG_SYNC_BYTES = 7_500;
export const ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY = 'sniptale_annotation_template_tags';

export class AnnotationTemplateTagQuotaError extends Error {
  readonly code = 'quota';
}

export function assertAnnotationTemplateTagStorageBudget(key: string, value: unknown): void {
  const bytes = new TextEncoder().encode(`${key}${JSON.stringify(value)}`).byteLength;
  if (bytes > MAX_ANNOTATION_TEMPLATE_TAG_SYNC_BYTES) throw new AnnotationTemplateTagQuotaError();
}
