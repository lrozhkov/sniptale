import { browserStorage } from '../infrastructure/browser-storage';
import { isUnsafeAnnotationTemplateTagState, parseAnnotationTemplateTagState } from './parser';
import { ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY } from './storage';
import { parseAnnotationTemplateTagIds } from './tag-ids';

export async function areKnownAnnotationTemplateTagIds(
  tagIds: readonly string[]
): Promise<boolean> {
  const parsedIds = parseAnnotationTemplateTagIds(tagIds);
  if (parsedIds.invalid) return false;
  const values = await browserStorage.sync.get([ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]);
  const parsedState = parseAnnotationTemplateTagState(values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]);
  if (isUnsafeAnnotationTemplateTagState(parsedState)) return false;
  const known = new Set(parsedState.value.tags.map((tag) => tag.id));
  return parsedIds.value.every((id) => known.has(id));
}
