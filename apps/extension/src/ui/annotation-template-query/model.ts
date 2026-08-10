import type {
  AnnotationTemplateTag,
  AnnotationTemplateTagId,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';

type AnnotationTemplateQueryItem = {
  id: string;
  displayName: string;
  tagIds: readonly AnnotationTemplateTagId[];
};

export function normalizeAnnotationTemplateQuery(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export function queryAnnotationTemplates<T extends AnnotationTemplateQueryItem>(args: {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  activeTemplateId?: string;
  items: readonly T[];
  query: string;
  tags: readonly AnnotationTemplateTag[];
}): T[] {
  const normalizedQuery = normalizeAnnotationTemplateQuery(args.query);
  const activeTagIds = new Set(args.activeFilterTagIds);
  const tagsById = new Map(args.tags.map((tag) => [tag.id, tag.label]));
  const matches = (item: T) => {
    const matchesTags =
      activeTagIds.size === 0 || item.tagIds.some((tagId) => activeTagIds.has(tagId));
    if (!matchesTags) return false;
    if (!normalizedQuery) return true;
    const searchable = [item.displayName, ...item.tagIds.map((tagId) => tagsById.get(tagId) ?? '')]
      .map(normalizeAnnotationTemplateQuery)
      .join('\n');
    return searchable.includes(normalizedQuery);
  };
  const result = args.items.filter(matches);
  if (!args.activeTemplateId) return result;
  const active = args.items.find((item) => item.id === args.activeTemplateId);
  return active ? [active, ...result.filter((item) => item.id !== active.id)] : result;
}

export function queryAnnotationTemplateValues<T extends { id: string }>(args: {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  activeTemplateId?: string;
  getDisplayName: (value: T) => string;
  getTagIds: (value: T) => readonly AnnotationTemplateTagId[] | undefined;
  query: string;
  tags: readonly AnnotationTemplateTag[];
  values: readonly T[];
}): T[] {
  return queryAnnotationTemplates({
    activeFilterTagIds: args.activeFilterTagIds,
    ...(args.activeTemplateId ? { activeTemplateId: args.activeTemplateId } : {}),
    items: args.values.map((value) => ({
      displayName: args.getDisplayName(value),
      id: value.id,
      tagIds: args.getTagIds(value) ?? [],
      value,
    })),
    query: args.query,
    tags: args.tags,
  }).map((item) => item.value);
}

export function resolveAnnotationTemplateTags(
  tagIds: readonly AnnotationTemplateTagId[] | undefined,
  tags: readonly AnnotationTemplateTag[]
): AnnotationTemplateTag[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return (tagIds ?? []).flatMap((tagId) => {
    const tag = byId.get(tagId);
    return tag ? [tag] : [];
  });
}
