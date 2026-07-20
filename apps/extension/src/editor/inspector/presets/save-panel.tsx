import type React from 'react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SelectField, TextField, cx } from '../../chrome/ui';
import type { EditorInspectorPresetSavePanelState } from './types';

const saveModeOptionClassName = 'h-10 min-h-10 whitespace-normal px-2 py-1 text-center leading-4';
const cancelButtonClassName = [
  'inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-xs font-medium',
  'text-[color:var(--sniptale-color-text-secondary)] transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'hover:text-[color:var(--sniptale-color-text-primary)]',
].join(' ');

function SaveModeButton(props: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      active={props.active}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cx('w-full', saveModeOptionClassName)}
    >
      {props.children}
    </ProductActionButton>
  );
}

function renderSaveModeSelector(state: EditorInspectorPresetSavePanelState) {
  return (
    <div
      aria-label={translate('editor.compact.templateSaveMode')}
      className="grid grid-cols-2 gap-2"
      role="group"
      data-editor-template-save-mode="true"
    >
      <SaveModeButton active={state.mode === 'create'} onClick={() => state.onModeChange('create')}>
        {translate('editor.compact.templateSaveModeCreate')}
      </SaveModeButton>
      <SaveModeButton
        active={state.mode === 'overwrite'}
        disabled={state.overwriteDisabled}
        onClick={() => state.onModeChange('overwrite')}
      >
        {translate('editor.compact.templateSaveModeOverwrite')}
      </SaveModeButton>
    </div>
  );
}

function renderSaveNameField(state: EditorInspectorPresetSavePanelState) {
  if (state.mode !== 'create') {
    return null;
  }

  return (
    <TextField
      aria-label={translate('editor.compact.templateName')}
      label={translate('editor.compact.templateName')}
      value={state.name}
      onChange={(event) => state.onNameChange(event.currentTarget.value)}
      placeholder={translate('editor.compact.templateNamePlaceholder')}
    />
  );
}

function renderOverwriteTargetField(state: EditorInspectorPresetSavePanelState) {
  if (state.mode !== 'overwrite' || state.overwriteDisabled) {
    return null;
  }

  return (
    <SelectField
      label={translate('editor.compact.templateOverwriteTarget')}
      value={state.overwriteTargetId}
      onChange={state.onOverwriteTargetChange}
      options={state.overwriteOptions}
      menuClassName="w-full max-w-none"
    />
  );
}

function renderOverwriteHint(state: EditorInspectorPresetSavePanelState) {
  if (state.mode !== 'overwrite' || !state.overwriteDisabled || !state.overwriteHint) {
    return null;
  }

  return (
    <p className="text-xs leading-5 text-[color:var(--sniptale-color-text-secondary)]">
      {state.overwriteHint}
    </p>
  );
}

function renderSavePanelActions(state: EditorInspectorPresetSavePanelState) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={state.onCancel} className={cancelButtonClassName}>
        {translate('editor.compact.cancel')}
      </button>
      <ProductActionButton
        compact
        onClick={state.onSave}
        disabled={!state.canSave}
        className="min-w-[6.25rem] justify-center"
      >
        {translate('common.actions.save')}
      </ProductActionButton>
    </div>
  );
}

export function EditorInspectorPresetSavePanel(props: {
  state: EditorInspectorPresetSavePanelState;
}) {
  return (
    <div
      className={[
        'space-y-3 rounded-[12px] border px-3 py-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_74%,var(--sniptale-color-surface-panel)_26%)]',
      ].join(' ')}
      data-editor-template-save-panel="true"
    >
      {renderSaveModeSelector(props.state)}
      {renderSaveNameField(props.state)}
      {renderOverwriteTargetField(props.state)}
      {renderOverwriteHint(props.state)}
      {renderSavePanelActions(props.state)}
    </div>
  );
}
