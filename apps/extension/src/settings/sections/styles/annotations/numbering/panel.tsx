import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { translate, useAppLocale } from '../../../../../platform/i18n';
import { getStepBadgePresetDisplayName } from '../../../../../features/highlighter/step-badge-presets/display-name';
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
} from '../../../../section-surface/panel-controls';
import { StepBadgePresetPreview } from '../../../../../ui/highlighter-preset-editor/step-badge/thumbnail';
import type { StepBadgePresetCatalogController } from './types';

type Preset = NonNullable<StepBadgePresetCatalogController['catalog']>['presets'][number];

function Actions(props: {
  controller: StepBadgePresetCatalogController;
  enabledCount: number;
  isDefault: boolean;
  preset: Preset;
}) {
  const visible = props.controller.hoveredId === props.preset.id;
  const last = props.preset.enabled !== false && props.enabledCount <= 1;
  return (
    <div className={getSettingsHoverActionsClassName(visible)}>
      <SettingsSwitch
        checked={props.preset.enabled !== false}
        disabled={last || props.controller.isSaving}
        onClick={() => void props.controller.actions.toggle(props.preset.id)}
        size="sm"
        title={
          last
            ? translate('highlighter.stepBadgePresets.lastEnabled')
            : translate('highlighter.stepBadgePresets.toggle')
        }
      />
      {!props.isDefault ? (
        <button
          className={settingsInfoIconButtonClassName}
          disabled={props.preset.enabled === false || props.controller.isSaving}
          onClick={() => void props.controller.actions.setDefault(props.preset.id)}
          title={translate('highlighter.stepBadgePresets.makeDefault')}
        >
          <Check size={14} />
        </button>
      ) : null}
      <button
        className={settingsInfoIconButtonClassName}
        disabled={props.controller.isSaving}
        onClick={() => props.controller.actions.edit(props.preset)}
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </button>
      {props.preset.origin === 'system' && props.preset.customized ? (
        <button
          className={settingsInfoIconButtonClassName}
          disabled={props.controller.isSaving}
          onClick={() => void props.controller.actions.reset(props.preset.id)}
          title={translate('highlighter.stepBadgePresets.reset')}
        >
          <RotateCcw size={14} />
        </button>
      ) : null}
      {props.preset.origin !== 'system' ? (
        <button
          className={settingsDangerIconButtonClassName}
          disabled={props.controller.isSaving}
          onClick={() => void props.controller.actions.delete(props.preset)}
          title={translate('highlighter.stepBadgePresets.delete')}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function StepBadgePresetsPanel({
  controller,
}: {
  controller: StepBadgePresetCatalogController;
}) {
  const locale = useAppLocale();
  if (controller.isLoading)
    return (
      <div className="py-6 text-sm text-[var(--sniptale-color-text-dim)]">
        {translate('common.states.loading')}
      </div>
    );
  if (controller.error || !controller.catalog)
    return (
      <div className="py-6 text-sm text-[var(--sniptale-color-danger)]">
        {translate('highlighter.stepBadgePresets.messages.loadError')}
      </div>
    );
  const enabledCount = controller.catalog.presets.filter(
    (preset) => preset.enabled !== false
  ).length;
  return (
    <section className="space-y-4" aria-label={translate('highlighter.stepBadgePresets.title')}>
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
          {translate('highlighter.stepBadgePresets.title')}
        </div>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.stepBadgePresets.description')}
        </p>
      </div>
      <div className="space-y-2">
        {controller.catalog.presets.map((preset) => {
          const isDefault = controller.catalog!.defaultPresetId === preset.id;
          return (
            <div
              className={[
                settingsListRowClassName,
                'cursor-grab',
                controller.draggedId === preset.id ? 'opacity-50' : '',
                controller.dragOverId === preset.id ? 'border-[var(--sniptale-color-success)]' : '',
              ].join(' ')}
              draggable
              key={preset.id}
              onDragStart={(event) => controller.actions.dragStart(event, preset.id)}
              onDragOver={(event) => controller.actions.dragOver(event, preset.id)}
              onDragLeave={controller.actions.dragLeave}
              onDrop={(event) => void controller.actions.drop(event, preset.id)}
              onDragEnd={controller.actions.dragEnd}
              onMouseEnter={() => controller.actions.hover(preset.id)}
              onMouseLeave={() => controller.actions.hover(null)}
            >
              <SettingsDragHandle />
              <StepBadgePresetPreview settings={preset.settings} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
                  {getStepBadgePresetDisplayName(preset, locale)}
                </div>
                <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-dim)]">
                  {preset.settings.style.sizeSource === 'frame-border'
                    ? translate('content.stepBadge.sizeFromFrame')
                    : `${preset.settings.style.diameter} px`}
                </div>
              </div>
              {isDefault ? (
                <span className={settingsSuccessBadgeClassName}>
                  {translate('highlighter.stepBadgePresets.defaultBadge')}
                </span>
              ) : null}
              {preset.origin === 'system' ? (
                <span className={settingsNeutralBadgeClassName}>
                  {translate('highlighter.stepBadgePresets.systemBadge')}
                </span>
              ) : null}
              <Actions
                controller={controller}
                enabledCount={enabledCount}
                isDefault={isDefault}
                preset={preset}
              />
            </div>
          );
        })}
      </div>
      <button className={settingsAddButtonClassName} onClick={controller.actions.add}>
        <Plus size={16} />
        {translate('highlighter.stepBadgePresets.add')}
      </button>
    </section>
  );
}
