import type { LucideIcon } from 'lucide-react';
import { Camera } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import type { QuickAction, QuickActionDelay, ViewportPreset } from '../../../contracts/settings';
import { HotkeyInput } from './hotkey-input';
import { allowedQuickActionIcons, delayOptions, quickActionIconMap } from './section/constants';
import { settingsMetaLabelClassName } from '../../section-surface';
import { type QuickActionsSectionState } from './section';

const iconPickerClassName = [
  'flex flex-wrap gap-1 rounded-md border p-2',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)]',
].join(' ');

const activeIconButtonClassName = [
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-border-soft)_82%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_16%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');

function DynamicIcon(props: { className?: string; name: string }) {
  const Icon: LucideIcon = quickActionIconMap[props.name] || Camera;
  return <Icon className={props.className} />;
}

function buildEmulationOptions(viewportPresets: ViewportPreset[] | undefined) {
  return [
    {
      value: 'native',
      label: `${translate('settings.quickActions.emulationNone')} (native)`,
    },
    ...(viewportPresets ?? []).map((preset) => ({
      value: preset.id,
      label: `${preset.label} (${preset.width}×${preset.height})`,
    })),
  ];
}

export function QuickActionsEditorIdentityFields(props: { state: QuickActionsSectionState }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-4">
      <div>
        <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.nameLabel')}
        </label>
        <ProductInput
          type="text"
          value={props.state.editForm?.name ?? ''}
          onChange={(event) => props.state.updateFormField('name', event.target.value)}
          placeholder={translate('settings.quickActions.namePlaceholder')}
        />
      </div>

      <div>
        <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.iconLabel')}
        </label>
        <div className={iconPickerClassName}>
          {allowedQuickActionIcons.map((iconName) => (
            <button
              key={iconName}
              type="button"
              onClick={() => props.state.updateFormField('icon', iconName)}
              className={`flex h-7 w-7 items-center justify-center rounded transition-all ${
                props.state.editForm?.icon === iconName
                  ? activeIconButtonClassName
                  : [
                      'border border-transparent text-[var(--sniptale-color-text-dim)]',
                      'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]',
                      'hover:text-[var(--sniptale-color-text-primary)]',
                    ].join(' ')
              }`}
              title={iconName}
            >
              <DynamicIcon name={iconName} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QuickActionsEditorPrimaryCaptureFields(props: { state: QuickActionsSectionState }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-4">
      <div>
        <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.hotkeyLabel')}
        </label>
        <HotkeyInput
          value={props.state.editForm?.hotkey ?? null}
          onChange={(hotkey) => props.state.updateFormField('hotkey', hotkey)}
          onError={props.state.handleHotkeyError}
          placeholder={translate('settings.quickActions.hotkeyPlaceholder')}
        />
      </div>

      <div>
        <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.screenshotModeLabel')}
        </label>
        <ProductSelect
          value={props.state.editForm?.screenshotMode ?? 'visible'}
          onChange={(value) =>
            props.state.updateFormField('screenshotMode', value as QuickAction['screenshotMode'])
          }
          options={[
            {
              value: 'visible',
              label: translate('settings.quickActions.screenshotModeVisible'),
            },
            { value: 'full', label: translate('settings.quickActions.screenshotModeFull') },
            {
              value: 'selection',
              label: translate('settings.quickActions.screenshotModeSelection'),
            },
          ]}
        />
      </div>
    </div>
  );
}

export function QuickActionsEditorSecondaryCaptureFields(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const emulationOptions = buildEmulationOptions(props.viewportPresets);

  return (
    <div className="mb-4 grid grid-cols-2 gap-4">
      <div>
        <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.screenEmulationLabel')}
        </label>
        <ProductSelect
          value={props.state.editForm?.emulation || 'native'}
          onChange={(value) =>
            props.state.updateFormField('emulation', value === 'native' ? null : value)
          }
          options={emulationOptions}
        />
      </div>

      <div>
        <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.delayLabel')}
        </label>
        <ProductSelect
          value={props.state.editForm?.delay === null ? '' : String(props.state.editForm?.delay)}
          onChange={(value) =>
            props.state.updateFormField(
              'delay',
              value === '' ? null : (parseInt(value, 10) as QuickActionDelay)
            )
          }
          options={delayOptions.map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
        />
      </div>
    </div>
  );
}
