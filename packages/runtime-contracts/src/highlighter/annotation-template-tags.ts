export const ANNOTATION_TEMPLATE_TAG_LIMITS = {
  maximumLabelLength: 32,
  maximumTags: 37,
  maximumTagsPerTemplate: 8,
} as const;

export const SYSTEM_ANNOTATION_TEMPLATE_TAG_KEYS = [
  'sniptale',
  'paper',
  'neon',
  'editorial',
  'retro80s',
] as const;
export type SystemAnnotationTemplateTagKey = (typeof SYSTEM_ANNOTATION_TEMPLATE_TAG_KEYS)[number];

export const SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS = {
  sniptale: 'system-tag-sniptale',
  paper: 'system-tag-paper',
  neon: 'system-tag-neon',
  editorial: 'system-tag-editorial',
  retro80s: 'system-tag-retro-80s',
} as const satisfies Record<SystemAnnotationTemplateTagKey, string>;

export type AnnotationTemplateTagId = string;

export interface AnnotationTemplateTag {
  basedOnRevision?: number;
  customized?: boolean;
  id: AnnotationTemplateTagId;
  label: string;
  origin?: 'system' | 'user';
  systemTagKey?: SystemAnnotationTemplateTagKey;
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
