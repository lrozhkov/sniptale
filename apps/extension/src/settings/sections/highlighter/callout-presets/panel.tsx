import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useAppLocale, translate } from '../../../../platform/i18n';
import { getCalloutPresetDisplayName } from '../../../../features/highlighter/callout-presets/display-name';
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
import { CalloutPresetPreview } from '../../../../ui/highlighter-preset-editor/callout/thumbnail';
import type { CalloutPresetCatalogController } from './types';

type Preset = NonNullable<CalloutPresetCatalogController['catalog']>['presets'][number];

function getConnectorLabel(kind: Preset['style']['connector']['kind']): string {
  if (kind === 'wedge') return translate('highlighter.calloutPresets.connector.wedge');
  if (kind === 'line') return translate('highlighter.calloutPresets.connector.line');
  return translate('highlighter.calloutPresets.connector.none');
}

function PresetActions(props: {
  controller: CalloutPresetCatalogController;
  enabledCount: number;
  isDefault: boolean;
  preset: Preset;
}) {
  const { actions } = props.controller;
  const isVisible = props.controller.hoveredId === props.preset.id;
  const isLastEnabled = props.preset.enabled !== false && props.enabledCount <= 1;
  return (
    <div className={getSettingsHoverActionsClassName(isVisible)}>
      <SettingsSwitch
        checked={props.preset.enabled !== false}
        disabled={isLastEnabled || props.controller.isSaving}
        onClick={() => void actions.toggle(props.preset.id)}
        size="sm"
        title={
          isLastEnabled
            ? translate('highlighter.calloutPresets.lastEnabled')
            : translate('highlighter.calloutPresets.toggle')
        }
      />
      {!props.isDefault ? (
        <button
          className={settingsInfoIconButtonClassName}
          disabled={props.preset.enabled === false || props.controller.isSaving}
          onClick={() => void actions.setDefault(props.preset.id)}
          title={translate('highlighter.calloutPresets.makeDefault')}
        >
          <Check size={14} />
        </button>
      ) : null}
      <button
        className={settingsInfoIconButtonClassName}
        disabled={props.controller.isSaving}
        onClick={() => actions.edit(props.preset)}
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </button>
      {props.preset.origin === 'system' && props.preset.customized ? (
        <button
          className={settingsInfoIconButtonClassName}
          disabled={props.controller.isSaving}
          onClick={() => void actions.reset(props.preset.id)}
          title={translate('highlighter.calloutPresets.reset')}
        >
          <RotateCcw size={14} />
        </button>
      ) : null}
      {props.preset.origin !== 'system' ? (
        <button
          className={settingsDangerIconButtonClassName}
          disabled={props.controller.isSaving}
          onClick={() => void actions.delete(props.preset)}
          title={translate('common.actions.delete')}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

function PresetRow(props: {
  controller: CalloutPresetCatalogController;
  enabledCount: number;
  preset: Preset;
}) {
  const locale = useAppLocale();
  const catalog = props.controller.catalog!;
  const isDefault = catalog.defaultPresetId === props.preset.id;
  const isDragging = props.controller.draggedId === props.preset.id;
  const isDragOver = props.controller.dragOverId === props.preset.id;
  return (
    <div
      className={[
        settingsListRowClassName,
        'cursor-grab',
        isDragging ? 'opacity-50' : '',
        isDragOver ? 'border-[var(--sniptale-color-success)]' : '',
      ].join(' ')}
      draggable
      onDragStart={(event) => props.controller.actions.dragStart(event, props.preset.id)}
      onDragOver={(event) => props.controller.actions.dragOver(event, props.preset.id)}
      onDragLeave={props.controller.actions.dragLeave}
      onDrop={(event) => void props.controller.actions.drop(event, props.preset.id)}
      onDragEnd={props.controller.actions.dragEnd}
      onMouseEnter={() => props.controller.actions.hover(props.preset.id)}
      onMouseLeave={() => props.controller.actions.hover(null)}
    >
      <SettingsDragHandle />
      <CalloutPresetPreview placement={props.preset.placement} style={props.preset.style} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
          {getCalloutPresetDisplayName(props.preset, locale)}
        </div>
        <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-dim)]">
          {getConnectorLabel(props.preset.style.connector.kind)}
        </div>
      </div>
      {isDefault ? (
        <span className={settingsSuccessBadgeClassName}>
          {translate('highlighter.calloutPresets.defaultBadge')}
        </span>
      ) : null}
      {props.preset.origin === 'system' ? (
        <span className={settingsNeutralBadgeClassName}>
          {translate('highlighter.calloutPresets.systemBadge')}
        </span>
      ) : null}
      <PresetActions {...props} isDefault={isDefault} />
    </div>
  );
}

export function CalloutPresetsPanel({
  controller,
}: {
  controller: CalloutPresetCatalogController;
}) {
  if (controller.isLoading) {
    return (
      <div className="py-6 text-sm text-[var(--sniptale-color-text-dim)]">
        {translate('common.states.loading')}
      </div>
    );
  }
  if (controller.error || !controller.catalog) {
    return (
      <div className="py-6 text-sm text-[var(--sniptale-color-danger)]">
        {translate('highlighter.calloutPresets.messages.loadError')}
      </div>
    );
  }
  const enabledCount = controller.catalog.presets.filter(
    (preset) => preset.enabled !== false
  ).length;
  return (
    <section className="space-y-4" aria-label={translate('highlighter.calloutPresets.title')}>
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
          {translate('highlighter.calloutPresets.title')}
        </div>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.calloutPresets.description')}
        </p>
      </div>
      <div className="space-y-2">
        {controller.catalog.presets.map((preset) => (
          <PresetRow
            key={preset.id}
            controller={controller}
            enabledCount={enabledCount}
            preset={preset}
          />
        ))}
      </div>
      <button className={settingsAddButtonClassName} onClick={controller.actions.add}>
        <Plus size={16} />
        {translate('highlighter.calloutPresets.add')}
      </button>
    </section>
  );
}
