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

function filterGroups(
  groups: readonly EditorInspectorTemplateGroupState[],
  query: string
): EditorInspectorTemplateGroupState[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return groups.map((group) => ({
      ...group,
      templates: [...group.templates],
    }));
  }

  return groups.map((group) => ({
    ...group,
    templates: group.templates.filter((template) =>
      template.label.toLocaleLowerCase().includes(normalizedQuery)
    ),
  }));
}

export function EditorInspectorTemplateCards(props: {
  groups?: readonly EditorInspectorTemplateGroupState[];
  saveDisabled?: boolean | undefined;
  savePanel?: EditorInspectorPresetSavePanelState | null | undefined;
  templates?: readonly EditorInspectorTemplateCardState[];
  onOpenSavePanel?: (() => void) | undefined;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(
    () => props.groups ?? createEditorInspectorTemplateGroups(props.templates ?? []),
    [props.groups, props.templates]
  );
  const filteredGroups = useMemo(() => filterGroups(groups, query), [groups, query]);

  return (
    <div className="space-y-3" data-editor-template-cards="true">
      <SearchField
        label={translate('editor.compact.templateSearchLabel')}
        value={query}
        placeholder={translate('editor.compact.templateSearchPlaceholder')}
        onChange={setQuery}
      />
      <PresetList
        groups={filteredGroups}
        emptyLabel={translate('editor.compact.noTemplatesAvailable')}
        saveLabel={translate('editor.compact.saveAsTemplate')}
        saveDisabled={props.saveDisabled}
        {...(props.onOpenSavePanel === undefined ? {} : { onSave: props.onOpenSavePanel })}
      />
      {props.savePanel ? <EditorInspectorPresetSavePanel state={props.savePanel} /> : null}
    </div>
  );
}
