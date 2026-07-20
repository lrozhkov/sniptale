import { Check, Trash2 } from 'lucide-react';

import {
  renderBorderPresetPreview,
  renderEditorPresetPreview,
} from '../../../features/editor/presets/preview';
import { getEditorPresetDisplayName } from '../../../features/editor/presets/display';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  getSettingsHoverActionsClassName,
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
  SettingsDragHandle,
  SettingsSwitch,
} from '../../section-surface/panel-controls';
import {
  EDITOR_SETTINGS_PALETTE_KEYS,
  EDITOR_SETTINGS_PRESET_OWNERS,
  getEditorPaletteLabel,
  getEditorPresetOwnerLabel,
} from './families';
import type {
  EditorManagedPreset,
  EditorSectionState,
  EditorSettingsManagedOwner,
  RectanglePreset,
} from './types';

function getDropTargetClassName(isHovered: boolean) {
  return isHovered
    ? [
        'border-[var(--sniptale-color-border-strong)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]',
      ].join(' ')
    : '';
}

function SystemBadges(props: { isDefault: boolean; isSystemDefault: boolean | undefined }) {
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {props.isDefault ? (
        <span className={`rounded-full px-2 py-0.5 text-xs ${settingsSuccessBadgeClassName}`}>
          {translate('highlighter.section.defaultBadge')}
        </span>
      ) : null}
      {props.isSystemDefault ? (
        <span className={`rounded-full px-2 py-0.5 text-xs ${settingsNeutralBadgeClassName}`}>
          {translate('highlighter.section.systemBadge')}
        </span>
      ) : null}
    </div>
  );
}

function RectanglePresetPreview(props: { preset: RectanglePreset }) {
  return renderBorderPresetPreview(props.preset);
}

function ManagedPresetPreview(props: {
  preset: EditorManagedPreset;
  presetOwner: EditorSettingsManagedOwner;
}) {
  return renderEditorPresetPreview(props.presetOwner, props.preset);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isRectanglePreset(
  preset: EditorSectionState['currentPresets'][number],
  presetOwner: EditorSectionState['presetOwner']
): preset is RectanglePreset {
  return presetOwner === 'rectangle' && isObject(preset);
}

function isManagedPreset(
  preset: EditorSectionState['currentPresets'][number],
  presetOwner: EditorSectionState['presetOwner']
): preset is EditorManagedPreset {
  return presetOwner !== 'rectangle' && isObject(preset) && isObject(preset['settings']);
}

function PresetPreview(props: {
  preset: EditorSectionState['currentPresets'][number];
  presetOwner: EditorSectionState['presetOwner'];
}) {
  if (isRectanglePreset(props.preset, props.presetOwner)) {
    return <RectanglePresetPreview preset={props.preset} />;
  }

  if (props.presetOwner !== 'rectangle' && isManagedPreset(props.preset, props.presetOwner)) {
    return <ManagedPresetPreview preset={props.preset} presetOwner={props.presetOwner} />;
  }

  return null;
}

function PresetActions(props: {
  isDefault: boolean;
  preset: EditorSectionState['currentPresets'][number];
  state: EditorSectionState;
}) {
  const { preset, state } = props;

  return (
    <div className={getSettingsHoverActionsClassName(true)}>
      <SettingsSwitch
        checked={preset.enabled !== false}
        size="sm"
        title={
          preset.enabled === false
            ? translate('savePresets.section.toggleShownTitle')
            : translate('savePresets.section.toggleHiddenTitle')
        }
        disabled={preset.isSystemDefault}
        onClick={() => void state.handleTogglePresetEnabled(preset.id, preset.enabled === false)}
      />
      <button
        type="button"
        className={settingsInfoIconButtonClassName}
        title={translate('editor.compact.workspaceMakeDefault')}
        disabled={props.isDefault || preset.enabled === false}
        onClick={() => void state.handleMakeDefaultPreset(preset.id)}
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        className={settingsDangerIconButtonClassName}
        title={translate('common.actions.delete')}
        disabled={preset.isSystemDefault}
        onClick={() => void state.handleDeletePreset(preset.id)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function renderPresetName(preset: EditorSectionState['currentPresets'][number]) {
  return (
    <div
      title={getEditorPresetDisplayName(preset)}
      className={[
        'line-clamp-2 break-words text-sm font-medium leading-5',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      {getEditorPresetDisplayName(preset)}
    </div>
  );
}

export function PresetScopeSwitch(props: { state: EditorSectionState }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {EDITOR_SETTINGS_PRESET_OWNERS.map((owner) => (
        <ProductActionButton
          key={owner}
          compact
          tone="toggle"
          active={props.state.presetOwner === owner}
          onClick={() => props.state.setPresetOwner(owner)}
          className="w-full text-sm"
        >
          {getEditorPresetOwnerLabel(owner)}
        </ProductActionButton>
      ))}
    </div>
  );
}

export function PresetRow(props: {
  preset: EditorSectionState['currentPresets'][number];
  state: EditorSectionState;
}) {
  const isDefault = props.state.currentDefaultPresetId === props.preset.id;
  const isHovered = props.state.dragOverPresetId === props.preset.id;

  return (
    <div
      draggable={true}
      onDragStart={() => props.state.handlePresetDragStart(props.preset.id)}
      onDragOver={(event) => {
        event.preventDefault();
        props.state.handlePresetDragOver(props.preset.id);
      }}
      onDragEnd={props.state.handlePresetDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        void props.state.handlePresetDrop(props.preset.id);
      }}
      className={[
        settingsListRowClassName,
        getDropTargetClassName(isHovered),
        props.preset.enabled === false ? 'opacity-60' : '',
      ].join(' ')}
    >
      <SettingsDragHandle />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={[
            'flex h-8 w-10 items-center justify-center rounded-lg border',
            'border-[var(--sniptale-color-border-soft)]',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]',
          ].join(' ')}
        >
          <PresetPreview preset={props.preset} presetOwner={props.state.presetOwner} />
        </span>
        <div className="min-w-0 flex-1">
          {renderPresetName(props.preset)}
          <SystemBadges isDefault={isDefault} isSystemDefault={props.preset.isSystemDefault} />
        </div>
      </div>
      <div className="shrink-0">
        <PresetActions isDefault={isDefault} preset={props.preset} state={props.state} />
      </div>
    </div>
  );
}

export function PaletteScopeSwitch(props: { state: EditorSectionState }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {EDITOR_SETTINGS_PALETTE_KEYS.map((paletteKey) => (
        <ProductActionButton
          key={paletteKey}
          compact
          tone="toggle"
          active={props.state.paletteKey === paletteKey}
          onClick={() => props.state.setPaletteKey(paletteKey)}
          className="w-full text-sm"
        >
          {getEditorPaletteLabel(paletteKey)}
        </ProductActionButton>
      ))}
    </div>
  );
}

export function PaletteRow(props: { color: string; index: number; state: EditorSectionState }) {
  const isHovered = props.state.dragOverColorIndex === props.index;

  return (
    <div
      draggable={true}
      onDragStart={() => props.state.handlePaletteDragStart(props.index)}
      onDragOver={(event) => {
        event.preventDefault();
        props.state.handlePaletteDragOver(props.index);
      }}
      onDragEnd={props.state.handlePaletteDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        void props.state.handlePaletteDrop(props.index);
      }}
      className={[settingsListRowClassName, getDropTargetClassName(isHovered)].join(' ')}
    >
      <SettingsDragHandle />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="h-8 w-8 rounded-lg border border-[var(--sniptale-color-border-soft)]"
          style={{ backgroundColor: props.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--sniptale-color-text-dim)]">#{props.index + 1}</div>
          <div className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {props.color}
          </div>
        </div>
      </div>
      <input
        aria-label={`${getEditorPaletteLabel(props.state.paletteKey)} ${props.index + 1}`}
        type="color"
        value={props.color}
        onChange={(event) => {
          void props.state.handlePaletteColorChange(props.index, event.currentTarget.value);
        }}
        className={[
          'h-10 w-10 cursor-pointer rounded-lg border',
          'border-[var(--sniptale-color-border-soft)] bg-transparent p-1',
        ].join(' ')}
      />
    </div>
  );
}
