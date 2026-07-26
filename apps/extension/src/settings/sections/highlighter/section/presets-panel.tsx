import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';

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
import type { HighlighterPresetsProps } from './types';

type BorderPresetItem = HighlighterPresetsProps['settings']['borderPresets'][number];
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
  enabledPresetCount,
  isDefault,
  preset,
  presets,
}: {
  enabledPresetCount: number;
  isDefault: boolean;
  preset: BorderPresetItem;
  presets: HighlighterPresetsProps['presets'];
}) {
  const isVisible = presets.hoveredPresetId === preset.id;
  const isLastEnabled = preset.enabled !== false && enabledPresetCount <= 1;

  return (
    <div className={getSettingsHoverActionsClassName(isVisible)}>
      <SettingsSwitch
        checked={preset.enabled !== false}
        size="sm"
        onClick={() => void presets.handleTogglePresetEnabled(preset.id)}
        disabled={isLastEnabled}
        title={
          isLastEnabled
            ? translate('highlighter.section.lastEnabledPresetDisabled')
            : getHighlighterPresetSwitchTitle(preset.enabled)
        }
      />
      {!isDefault ? (
        <MakeDefaultPresetButton
          disabled={preset.enabled === false}
          onClick={() => presets.handleSetDefaultPreset(preset.id)}
        />
      ) : null}
      <button
        onClick={() => presets.handleEditPreset(preset)}
        className={settingsInfoIconButtonClassName}
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </button>
      {preset.origin === 'system' && preset.customized === true ? (
        <button
          onClick={() => void presets.handleResetPreset(preset.id)}
          className={settingsInfoIconButtonClassName}
          title={translate('highlighter.section.resetSystemPresetTitle')}
        >
          <RotateCcw size={14} />
        </button>
      ) : null}
      {preset.origin !== 'system' ? (
        <button
          onClick={() => presets.handleDeletePreset(preset)}
          className={settingsDangerIconButtonClassName}
          title={translate('common.actions.delete')}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

function getHighlighterPresetRowState(
  preset: BorderPresetItem,
  props: HighlighterPresetsProps
): HighlighterPresetRowState {
  return {
    isDefault: props.settings.defaultBorderPresetId === preset.id,
    isDragOver: props.presets.dragOverId === preset.id,
    isDragging: props.presets.draggedId === preset.id,
    isHovered: props.presets.hoveredPresetId === preset.id,
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
  enabledPresetCount,
  preset,
  settings,
  presets,
}: HighlighterPresetsProps & { enabledPresetCount: number; preset: BorderPresetItem }) {
  const rowState = getHighlighterPresetRowState(preset, { presets, settings });
  const rowClassName = getHighlighterPresetRowClassName(rowState);

  return (
    <div
      draggable={true}
      onDragStart={(e) => presets.handleDragStart(e, preset.id)}
      onDragOver={(e) => presets.handleDragOver(e, preset.id)}
      onDragLeave={presets.handleDragLeave}
      onDrop={(e) => presets.handleDrop(e, preset.id)}
      onDragEnd={presets.handleDragEnd}
      onMouseEnter={() => presets.handlePresetHoverChange(preset.id)}
      onMouseLeave={() => presets.handlePresetHoverChange(null)}
      className={rowClassName}
    >
      <div className="flex w-full min-w-0 items-start gap-3">
        <SettingsDragHandle />
        <HighlighterPresetRowContent preset={preset} />
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 pt-0.5">
          {rowState.isDefault ? (
            <HighlighterPresetBadge tone="success" copyKey="highlighter.section.defaultBadge" />
          ) : null}
          {preset.origin === 'system' ? (
            <HighlighterPresetBadge tone="neutral" copyKey="highlighter.section.systemBadge" />
          ) : null}
        </div>
        <HighlighterPresetActions
          enabledPresetCount={enabledPresetCount}
          isDefault={rowState.isDefault}
          preset={preset}
          presets={presets}
        />
      </div>
    </div>
  );
}

export function HighlighterPresetsPanel({ presets, settings }: HighlighterPresetsProps) {
  const enabledPresetCount = settings.borderPresets.filter(
    (preset) => preset.enabled !== false
  ).length;
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
          <HighlighterPresetRow
            key={preset.id}
            enabledPresetCount={enabledPresetCount}
            preset={preset}
            presets={presets}
            settings={settings}
          />
        ))}
      </div>

      <AddHighlighterPresetButton onClick={presets.handleAddPreset} />
    </div>
  );
}
