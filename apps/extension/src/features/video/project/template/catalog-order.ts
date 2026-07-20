import { VideoTemplateCatalogStatus } from './catalog-status';

interface TemplateCatalogDefinition<TGroupLabelKey extends string, TTemplateKind extends string> {
  catalogRank: number;
  catalogStatus: VideoTemplateCatalogStatus;
  groupLabelKey: TGroupLabelKey;
  templateKind: TTemplateKind;
}

export interface TemplateCatalogGroup<TGroupLabelKey extends string, TTemplateKind extends string> {
  groupLabelKey: TGroupLabelKey;
  templateKinds: readonly TTemplateKind[];
}

const VIDEO_TEMPLATE_STATUS_ORDER = [
  VideoTemplateCatalogStatus.CORE,
  VideoTemplateCatalogStatus.OPTIONAL,
  VideoTemplateCatalogStatus.LEGACY,
] as const satisfies readonly VideoTemplateCatalogStatus[];

function compareCatalogStatus(
  left: VideoTemplateCatalogStatus,
  right: VideoTemplateCatalogStatus
): number {
  return VIDEO_TEMPLATE_STATUS_ORDER.indexOf(left) - VIDEO_TEMPLATE_STATUS_ORDER.indexOf(right);
}

function compareTemplateDefinitions(
  left: TemplateCatalogDefinition<string, string>,
  right: TemplateCatalogDefinition<string, string>
): number {
  return (
    compareCatalogStatus(left.catalogStatus, right.catalogStatus) ||
    left.catalogRank - right.catalogRank
  );
}

function getGroupOrderIndex<TGroupLabelKey extends string>(
  groupOrder: readonly TGroupLabelKey[],
  groupLabelKey: TGroupLabelKey
): number {
  const groupIndex = groupOrder.findIndex((value) => value === groupLabelKey);
  return groupIndex >= 0 ? groupIndex : Number.MAX_SAFE_INTEGER;
}

export function buildTemplateSelectionOrder<
  TDefinition extends TemplateCatalogDefinition<string, string>,
>(
  definitions: readonly TDefinition[],
  groupOrder: readonly TDefinition['groupLabelKey'][],
  includeDefinition: (definition: TDefinition) => boolean = () => true
): readonly TDefinition['templateKind'][] {
  return [...definitions]
    .filter(includeDefinition)
    .sort(
      (left, right) =>
        getGroupOrderIndex(groupOrder, left.groupLabelKey) -
          getGroupOrderIndex(groupOrder, right.groupLabelKey) ||
        compareTemplateDefinitions(left, right)
    )
    .map((definition) => definition.templateKind);
}

export function buildTemplateGroups<TDefinition extends TemplateCatalogDefinition<string, string>>(
  definitions: readonly TDefinition[],
  groupOrder: readonly TDefinition['groupLabelKey'][],
  includeDefinition: (definition: TDefinition) => boolean = () => true
): readonly TemplateCatalogGroup<TDefinition['groupLabelKey'], TDefinition['templateKind']>[] {
  return groupOrder
    .map((groupLabelKey) => ({
      groupLabelKey,
      templateKinds: definitions
        .filter(
          (definition) =>
            definition.groupLabelKey === groupLabelKey && includeDefinition(definition)
        )
        .sort(compareTemplateDefinitions)
        .map((definition) => definition.templateKind),
    }))
    .filter((group) => group.templateKinds.length > 0);
}
