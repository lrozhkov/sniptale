import { useMemo, useState } from 'react';

import { translate } from '../../../platform/i18n';
import { PresetList, SearchField } from '../../chrome/ui';
import { EditorInspectorPresetSavePanel } from './save-panel';
import { createEditorInspectorTemplateGroups } from './template-groups';
import type {
  EditorInspectorPresetSavePanelState,
  EditorInspectorTemplateCardState,
  EditorInspectorTemplateGroupState,
} from './types';
import {
  AnnotationTemplateQueryControls,
  AnnotationTemplateQueryEmpty,
  AnnotationTemplateTagChips,
  queryAnnotationTemplateValues,
  resolveAnnotationTemplateTags,
  useAnnotationTemplateTagState,
} from '../../../ui/annotation-template-query';

function filterGroups(
  groups: readonly EditorInspectorTemplateGroupState[],
  query: string,
  tagState: ReturnType<typeof useAnnotationTemplateTagState>['state'],
  enabled: boolean
): EditorInspectorTemplateGroupState[] {
  if (!enabled) {
    const normalizedQuery = query.trim().toLowerCase();
    return groups.map((group) => ({
      ...group,
      templates: group.templates.filter((template) =>
        template.label.toLowerCase().includes(normalizedQuery)
      ),
    }));
  }
  return groups.map((group) => ({
    ...group,
    templates: queryAnnotationTemplateValues({
      activeFilterTagIds: tagState.activeFilterTagIds,
      ...(group.templates.find((template) => template.selected)?.id
        ? { activeTemplateId: group.templates.find((template) => template.selected)!.id }
        : {}),
      getDisplayName: (template) => template.label,
      getTagIds: (template) => template.tagIds,
      query,
      tags: tagState.tags,
      values: group.templates,
    }),
  }));
}

export function EditorInspectorTemplateCards(props: {
  annotationTagFiltering?: boolean | undefined;
  groups?: readonly EditorInspectorTemplateGroupState[];
  saveDisabled?: boolean | undefined;
  savePanel?: EditorInspectorPresetSavePanelState | null | undefined;
  templates?: readonly EditorInspectorTemplateCardState[];
  onOpenSavePanel?: (() => void) | undefined;
}) {
  const [query, setQuery] = useState('');
  const tagState = useAnnotationTemplateTagState(props.annotationTagFiltering === true);
  const groups = useMemo(
    () => props.groups ?? createEditorInspectorTemplateGroups(props.templates ?? []),
    [props.groups, props.templates]
  );
  const filteredGroups = useMemo(
    () => filterGroups(groups, query, tagState.state, props.annotationTagFiltering === true),
    [groups, props.annotationTagFiltering, query, tagState.state]
  );
  const visibleGroups = filteredGroups.map((group) => ({
    ...group,
    templates: group.templates.map((template) => ({
      ...template,
      supplement:
        props.annotationTagFiltering === true ? (
          <AnnotationTemplateTagChips
            tags={resolveAnnotationTemplateTags(template.tagIds ?? [], tagState.state.tags)}
          />
        ) : undefined,
    })),
  }));

  return (
    <div className="space-y-3" data-editor-template-cards="true">
      {props.annotationTagFiltering === true ? (
        <AnnotationTemplateQueryControls
          activeFilterTagIds={tagState.state.activeFilterTagIds}
          compact
          disabled={tagState.isLoading || tagState.error}
          onActiveFilterTagIdsChange={tagState.setActiveFilterTagIds}
          onQueryChange={setQuery}
          query={query}
          tags={tagState.state.tags}
        />
      ) : (
        <SearchField
          label={translate('editor.compact.templateSearchLabel')}
          value={query}
          placeholder={translate('editor.compact.templateSearchPlaceholder')}
          onChange={setQuery}
        />
      )}
      <PresetList
        groups={visibleGroups}
        emptyLabel={
          props.annotationTagFiltering === true ? (
            <AnnotationTemplateQueryEmpty
              hasFilter={tagState.state.activeFilterTagIds.length > 0}
              onClearFilter={() => void tagState.setActiveFilterTagIds([])}
              onClearQuery={() => setQuery('')}
              query={query}
            />
          ) : (
            translate('editor.compact.noTemplatesAvailable')
          )
        }
        saveLabel={translate('editor.compact.saveAsTemplate')}
        saveDisabled={props.saveDisabled}
        {...(props.onOpenSavePanel === undefined ? {} : { onSave: props.onOpenSavePanel })}
      />
      {props.savePanel ? <EditorInspectorPresetSavePanel state={props.savePanel} /> : null}
    </div>
  );
}
