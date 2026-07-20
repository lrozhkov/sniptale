import type React from 'react';

import { translate } from '../../../platform/i18n';
import { FileActionRow } from '../../chrome/ui';
import { EditorInspectorTemplateCards } from './cards';
import { EditorInspectorPresetSavePanel } from './save-panel';
import { EditorInspectorPresetViewSwitch } from './switch';
import type { EditorInspectorPresetHeaderState } from './types';

function EditorInspectorPresetParameters(props: {
  children: React.ReactNode;
  state: EditorInspectorPresetHeaderState;
}) {
  return (
    <div className="space-y-3" data-editor-preset-parameters="true">
      {props.children}
      <FileActionRow
        disabled={props.state.saveDisabled}
        onClick={props.state.onOpenSavePanel}
        data-editor-template-save-trigger="true"
      >
        {translate('editor.compact.saveAsTemplate')}
      </FileActionRow>
      {props.state.savePanel ? (
        <EditorInspectorPresetSavePanel state={props.state.savePanel} />
      ) : null}
    </div>
  );
}

export function EditorInspectorPresetHeader(props: {
  children?: React.ReactNode;
  state: EditorInspectorPresetHeaderState;
}) {
  const { state } = props;

  return (
    <div className="space-y-3" data-editor-preset-section="true">
      <EditorInspectorPresetViewSwitch
        activeView={state.activeView}
        onChange={state.onViewChange}
      />
      {state.activeView === 'templates' ? (
        <EditorInspectorTemplateCards
          templates={state.templates}
          saveDisabled={state.saveDisabled}
          savePanel={state.savePanel}
          onOpenSavePanel={state.onOpenSavePanel}
          {...(state.groups === undefined ? {} : { groups: state.groups })}
        />
      ) : (
        <EditorInspectorPresetParameters state={state}>
          {props.children}
        </EditorInspectorPresetParameters>
      )}
    </div>
  );
}
