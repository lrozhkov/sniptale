import type { PromptTemplate } from '../../../../../contracts/settings';

const INITIAL_VISIBLE_COUNT = 6;

export function buildTemplateListDerivedState(props: {
  orderedIds: string[];
  showAll: boolean;
  templates: PromptTemplate[];
}) {
  const orderedTemplates = [...props.templates].sort(
    (left, right) => props.orderedIds.indexOf(left.id) - props.orderedIds.indexOf(right.id)
  );

  return {
    hasMore: orderedTemplates.length > INITIAL_VISIBLE_COUNT,
    orderedTemplates,
    visibleTemplates: props.showAll
      ? orderedTemplates
      : orderedTemplates.slice(0, INITIAL_VISIBLE_COUNT),
  };
}

export function useTemplateListDerivedState(props: {
  orderedIds: string[];
  showAll: boolean;
  templates: PromptTemplate[];
}) {
  return buildTemplateListDerivedState(props);
}
