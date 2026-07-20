import React from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { SavePreset } from '../../../contracts/settings';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import {
  INSPECTOR_ACTION_BUTTON_BASE_CLASS_NAME,
  INSPECTOR_STATUS_BADGE_NEUTRAL_CLASS_NAME,
  INSPECTOR_STATUS_BADGE_SUCCESS_CLASS_NAME,
} from '../chrome';
import { cx } from '../../chrome/ui';

const presetPathClassName =
  'block truncate text-[11px] text-[color:var(--sniptale-color-text-muted)]';

function PresetStatusBadge(props: { isSaved: boolean; isSaving: boolean }) {
  if (props.isSaving) {
    return (
      <span
        className={INSPECTOR_STATUS_BADGE_NEUTRAL_CLASS_NAME}
        title={translate('common.states.saving')}
        aria-label={translate('common.states.saving')}
      >
        <LoaderCircle size={12} className="animate-spin" strokeWidth={2} />
      </span>
    );
  }

  if (props.isSaved) {
    return (
      <span
        className={INSPECTOR_STATUS_BADGE_SUCCESS_CLASS_NAME}
        title={translate('common.states.saved')}
        aria-label={translate('common.states.saved')}
      >
        <Check size={12} strokeWidth={2.4} />
      </span>
    );
  }

  return null;
}

function getPresetOptionClassName(isSaved: boolean) {
  return cx(
    INSPECTOR_ACTION_BUTTON_BASE_CLASS_NAME,
    'bg-transparent',
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
    isSaved &&
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_24%,var(--sniptale-color-surface-input)_76%)]'
  );
}

const PresetOptionButton: React.FC<{
  defaultImagePresetId: string | null;
  feedbackPresetId: string | null;
  preset: SavePreset;
  savingPresetId: string | null;
  onSaveToPreset: (presetId: string) => void | Promise<void>;
}> = ({ defaultImagePresetId, feedbackPresetId, preset, savingPresetId, onSaveToPreset }) => {
  const isDefault = preset.id === defaultImagePresetId;
  const isSaved = preset.id === feedbackPresetId;
  const isSaving = preset.id === savingPresetId;

  return (
    <button
      type="button"
      onClick={() =>
        fireAndReportEditorAction(`document-preset:${preset.id}`, () => onSaveToPreset(preset.id))
      }
      data-default={isDefault ? 'true' : 'false'}
      data-ui={`editor.file-actions.preset.${preset.id}`}
      className={getPresetOptionClassName(isSaved)}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-[color:var(--sniptale-color-text-primary)]">
          {preset.name}
        </span>
        <span className={presetPathClassName}>
          {translate('editor.documentActions.downloadsPrefix')}{' '}
          {preset.path || translate('editor.documentActions.pathFallback')}
        </span>
      </span>
      <PresetStatusBadge isSaved={isSaved} isSaving={isSaving} />
    </button>
  );
};

export const EditorInspectorDocumentPresetOptions: React.FC<{
  defaultImagePresetId: string | null;
  feedbackPresetId?: string | null;
  savePresets: SavePreset[];
  savingPresetId?: string | null;
  onSaveToPreset: (presetId: string) => void | Promise<void>;
}> = ({
  defaultImagePresetId,
  feedbackPresetId = null,
  savePresets,
  savingPresetId = null,
  onSaveToPreset,
}) => {
  if (savePresets.length === 0) {
    return (
      <div
        data-ui="editor.file-actions.presets-empty"
        className="text-sm leading-6 text-[color:var(--sniptale-color-text-secondary)]"
      >
        {translate('editor.documentActions.noPresetsDescription')}
      </div>
    );
  }

  return (
    <div data-ui="editor.file-actions.presets-list" className="space-y-2">
      {savePresets.map((preset) => (
        <PresetOptionButton
          key={preset.id}
          defaultImagePresetId={defaultImagePresetId}
          feedbackPresetId={feedbackPresetId}
          preset={preset}
          savingPresetId={savingPresetId}
          onSaveToPreset={onSaveToPreset}
        />
      ))}
    </div>
  );
};
