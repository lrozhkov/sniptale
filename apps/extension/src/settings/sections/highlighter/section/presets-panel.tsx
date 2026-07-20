import { Check, Pencil, Plus, Trash2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { getHighlighterPresetCountLabel } from './helpers';
import { HighlighterPresetRowContent } from './preset-row-content';
import {
  getSettingsHoverActionsClassName,
  settingsAddButtonClassName,
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
  SettingsDragHandle,
  SettingsSwitch,
} from '../../../section-surface/panel-controls';
import type { HighlighterSectionContentProps } from './types';

type BorderPresetItem = HighlighterSectionContentProps['settings']['borderPresets'][number];
type HighlighterPresetRowState = {
  isDefault: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  isHovered: boolean;
};

function HighlighterPresetBadge({
  copyKey,
  tone,
}: {
  copyKey: 'highlighter.section.defaultBadge' | 'highlighter.section.systemBadge';
  tone: 'neutral' | 'success';
}) {
  const badgeClassName =
    tone === 'success' ? settingsSuccessBadgeClassName : settingsNeutralBadgeClassName;

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClassName}`}>
      {translate(copyKey)}
    </span>
  );
}

function getHighlighterPresetSwitchTitle(enabled: boolean | undefined): string {
  return enabled === false
    ? translate('savePresets.section.toggleShownTitle')
    : translate('savePresets.section.toggleHiddenTitle');
}

function MakeDefaultPresetButton(props: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={settingsInfoIconButtonClassName}
      title={translate('highlighter.section.makeDefaultTitle')}
    >
      <Check size={14} />
    </button>
  );
}

function HighlighterPresetActions({
  isDefault,
  preset,
  state,
}: {
  isDefault: boolean;
  preset: BorderPresetItem;
  state: HighlighterSectionContentProps['state'];
}) {
  const isVisible = state.hoveredPresetId === preset.id;
  const { deleteTitle, editTitle } = getHighlighterPresetActionTitles(preset.isSystemDefault);

  return (
    <div className={getSettingsHoverActionsClassName(isVisible)}>
      <SettingsSwitch
        checked={preset.enabled !== false}
        size="sm"
        onClick={() => void state.handleTogglePresetEnabled(preset.id)}
        title={getHighlighterPresetSwitchTitle(preset.enabled)}
      />
      {!isDefault ? (
        <MakeDefaultPresetButton
          disabled={preset.enabled === false}
          onClick={() => state.handleSetDefaultPreset(preset.id)}
        />
      ) : null}
      <button
        onClick={() => state.handleEditPreset(preset)}
        disabled={preset.isSystemDefault}
        className={settingsInfoIconButtonClassName}
        title={editTitle}
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={() => state.handleDeletePreset(preset)}
        disabled={preset.isSystemDefault}
        className={settingsDangerIconButtonClassName}
        title={deleteTitle}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function getHighlighterPresetActionTitles(isSystemDefault: boolean | undefined) {
  return {
    deleteTitle:
      isSystemDefault === true
        ? translate('highlighter.section.systemPresetDeleteDisabled')
        : translate('common.actions.delete'),
    editTitle:
      isSystemDefault === true
        ? translate('highlighter.section.systemPresetEditDisabled')
        : translate('common.actions.edit'),
  };
}

function getHighlighterPresetRowState(
  preset: BorderPresetItem,
  props: HighlighterSectionContentProps
): HighlighterPresetRowState {
  return {
    isDefault: props.settings.defaultBorderPresetId === preset.id,
    isDragOver: props.state.dragOverId === preset.id,
    isDragging: props.state.draggedId === preset.id,
    isHovered: props.state.hoveredPresetId === preset.id,
  };
}

function getHighlighterPresetRowClassName(state: HighlighterPresetRowState): string {
  return [
    settingsListRowClassName,
    'cursor-grab',
    state.isDragging ? 'scale-[0.98] opacity-50' : '',
    state.isDragOver
      ? 'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_36%,var(--sniptale-color-border-soft)_64%)]'
      : '',
    state.isDragOver
      ? 'bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_8%,transparent)]'
      : '',
    state.isHovered && !state.isDragging
      ? [
          'border-[var(--sniptale-color-border-strong)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_72%,transparent)]',
        ].join(' ')
      : '',
  ].join(' ');
}

function AddHighlighterPresetButton(props: { onClick: () => void }) {
  return (
    <button onClick={props.onClick} className={settingsAddButtonClassName}>
      <Plus size={16} />
      {translate('highlighter.section.addButton')}
    </button>
  );
}

function HighlighterPresetRow({
  preset,
  settings,
  state,
}: HighlighterSectionContentProps & { preset: BorderPresetItem }) {
  const rowState = getHighlighterPresetRowState(preset, { settings, state });
  const rowClassName = getHighlighterPresetRowClassName(rowState);

  return (
    <div
      draggable={true}
      onDragStart={(e) => state.handleDragStart(e, preset.id)}
      onDragOver={(e) => state.handleDragOver(e, preset.id)}
      onDragLeave={state.handleDragLeave}
      onDrop={(e) => state.handleDrop(e, preset.id)}
      onDragEnd={state.handleDragEnd}
      onMouseEnter={() => state.setHoveredPresetId(preset.id)}
      onMouseLeave={() => state.setHoveredPresetId(null)}
      className={rowClassName}
    >
      <div className="flex w-full min-w-0 items-start gap-3">
        <SettingsDragHandle />
        <HighlighterPresetRowContent preset={preset} />
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 pt-0.5">
          {rowState.isDefault ? (
            <HighlighterPresetBadge tone="success" copyKey="highlighter.section.defaultBadge" />
          ) : null}
          {preset.isSystemDefault ? (
            <HighlighterPresetBadge tone="neutral" copyKey="highlighter.section.systemBadge" />
          ) : null}
        </div>
        <HighlighterPresetActions isDefault={rowState.isDefault} preset={preset} state={state} />
      </div>
    </div>
  );
}

export function HighlighterPresetsPanel({ settings, state }: HighlighterSectionContentProps) {
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
          {translate('highlighter.section.presetsLabel')}
        </span>
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">
          {settings.borderPresets.length}{' '}
          {getHighlighterPresetCountLabel(settings.borderPresets.length)}
        </span>
      </div>

      <div className="mb-4 space-y-2">
        {settings.borderPresets.map((preset) => (
          <HighlighterPresetRow key={preset.id} preset={preset} settings={settings} state={state} />
        ))}
      </div>

      <AddHighlighterPresetButton onClick={state.handleAddPreset} />
    </div>
  );
}
