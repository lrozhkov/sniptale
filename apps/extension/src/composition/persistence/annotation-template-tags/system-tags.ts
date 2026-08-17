import {
  SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS,
  type AnnotationTemplateTag,
  type SystemAnnotationTemplateTagKey,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';

export const SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION = 3;

type SystemAnnotationTemplateTag = AnnotationTemplateTag & {
  basedOnRevision: number;
  customized: boolean;
  origin: 'system';
  systemTagKey: SystemAnnotationTemplateTagKey;
};

const canonicalSystemTags: readonly SystemAnnotationTemplateTag[] = [
  {
    basedOnRevision: SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
    customized: false,
    id: SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.sniptale,
    label: 'Sniptale',
    origin: 'system',
    systemTagKey: 'sniptale',
  },
  {
    basedOnRevision: SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
    customized: false,
    id: SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.paper,
    label: 'Paper',
    origin: 'system',
    systemTagKey: 'paper',
  },
  {
    basedOnRevision: SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
    customized: false,
    id: SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.neon,
    label: 'Neon',
    origin: 'system',
    systemTagKey: 'neon',
  },
  {
    basedOnRevision: SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
    customized: false,
    id: SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.editorial,
    label: 'Editorial',
    origin: 'system',
    systemTagKey: 'editorial',
  },
  {
    basedOnRevision: SYSTEM_ANNOTATION_TEMPLATE_TAG_CATALOG_REVISION,
    customized: false,
    id: SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.retro80s,
    label: 'Retro 80s',
    origin: 'system',
    systemTagKey: 'retro80s',
  },
];

export function createSystemAnnotationTemplateTags(): AnnotationTemplateTag[] {
  return canonicalSystemTags.map((tag) => ({ ...tag }));
}

export function isCanonicalSystemAnnotationTemplateTagLabel(label: string): boolean {
  const folded = label.toLowerCase();
  return canonicalSystemTags.some((tag) => tag.label.toLowerCase() === folded);
}

export function getCanonicalSystemAnnotationTemplateTag(
  key: SystemAnnotationTemplateTagKey
): SystemAnnotationTemplateTag {
  return { ...canonicalSystemTags.find((tag) => tag.systemTagKey === key)! };
}
