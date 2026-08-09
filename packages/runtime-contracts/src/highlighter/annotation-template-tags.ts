export const ANNOTATION_TEMPLATE_TAG_LIMITS = {
  maximumLabelLength: 32,
  maximumTags: 32,
  maximumTagsPerTemplate: 8,
} as const;

export type AnnotationTemplateTagId = string;

export interface AnnotationTemplateTag {
  id: AnnotationTemplateTagId;
  label: string;
}

export interface AnnotationTemplateTagState {
  activeFilterTagIds: AnnotationTemplateTagId[];
  schemaVersion: number;
  tags: AnnotationTemplateTag[];
}

export function cloneAnnotationTemplateTagState(
  state: AnnotationTemplateTagState
): AnnotationTemplateTagState {
  return {
    activeFilterTagIds: [...state.activeFilterTagIds],
    schemaVersion: state.schemaVersion,
    tags: state.tags.map((tag) => ({ ...tag })),
  };
}
