import { useRef, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { LucideIcon } from 'lucide-react';
import { Camera, ChevronDown, ChevronUp } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { InspectorFieldClear } from '../../../../ui/compact-inspector-controls/text-field';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import type { QuickAction, QuickActionDelay, ViewportPreset } from '../../../../contracts/settings';
import { HotkeyInput } from './hotkey-input';
import { allowedQuickActionIcons, delayOptions, quickActionIconMap } from './section/constants';
import { SettingsControlRow, settingsMetaLabelClassName } from '../../../section-surface';
import { type QuickActionsSectionState } from './controller';
import { getViewportPresetDisplayName } from '../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../features/viewport-presets/format';

const iconPickerClassName = ['flex min-h-9 flex-wrap items-center gap-1'].join(' ');

const activeIconButtonClassName = [
  'border border-[var(--sniptale-color-border-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_16%,transparent)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

function DynamicIcon(props: { className?: string; name: string }) {
  const Icon: LucideIcon = quickActionIconMap[props.name] || Camera;
  return <Icon className={props.className} />;
}

function buildViewportPresetOptions(viewportPresets: ViewportPreset[] | undefined) {
  return [
    {
      value: '',
      label: translate('viewportPresets.section.nativeOption'),
    },
    ...(viewportPresets ?? [])
      .filter((preset) => preset.enabled)
      .map((preset) => ({
        value: preset.id,
        label: `${getViewportPresetDisplayName(preset)} (${formatViewportPresetDimensions(
          preset.width,
          preset.height
        )})`,
        description: translate(`viewportPresets.hints.${preset.target}`),
      })),
  ];
}

export function QuickActionsEditorIdentityFields(props: { state: QuickActionsSectionState }) {
  const [expanded, setExpanded] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const initialIcons: readonly string[] = allowedQuickActionIcons.slice(0, 24);
  const selected = props.state.editForm?.icon;
  const visibleIcons = expanded
    ? allowedQuickActionIcons
    : selected && !initialIcons.includes(selected)
      ? [...initialIcons.slice(0, 23), selected]
      : initialIcons;
  return (
    <div className="sniptale-parameter-stack">
      <SettingsControlRow label={translate('settings.quickActions.nameLabel')}>
        <div className="sniptale-text-value">
          <ProductInput
            ref={nameInput}
            autoFocus
            aria-label={translate('settings.quickActions.nameLabel')}
            type="text"
            value={props.state.editForm?.name ?? ''}
            onChange={(event) => props.state.updateFormField('name', event.target.value)}
            placeholder={translate('settings.quickActions.namePlaceholder')}
          />
          {props.state.editForm?.name ? (
            <InspectorFieldClear
              label={translate('settings.quickActions.nameLabel')}
              target={nameInput}
            />
          ) : null}
        </div>
      </SettingsControlRow>

      <div>
        <label className={`mb-1.5 block ${settingsMetaLabelClassName}`}>
          {translate('settings.quickActions.iconLabel')}
        </label>
        <div
          data-ui="settings.quick-actions.icons"
          className={[
            iconPickerClassName,
            'max-h-[72px] overflow-y-hidden',
            expanded ? '!max-h-40 !overflow-y-auto' : '',
          ].join(' ')}
        >
          {visibleIcons.map((iconName) => (
            <ProductActionButton
              compact
              tone="toggle"
              active={props.state.editForm?.icon === iconName}
              aria-pressed={props.state.editForm?.icon === iconName}
              key={iconName}
              type="button"
              onClick={() => props.state.updateFormField('icon', iconName)}
              className={`flex h-8 w-8 items-center justify-center rounded transition-all ${
                props.state.editForm?.icon === iconName
                  ? activeIconButtonClassName
                  : [
                      'border border-transparent text-[var(--sniptale-color-text-dim)]',
                      'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]',
                      'hover:text-[var(--sniptale-color-text-primary)]',
                    ].join(' ')
              }`}
              title={iconName}
              aria-label={iconName}
            >
              <DynamicIcon name={iconName} className="h-4 w-4" />
            </ProductActionButton>
          ))}
        </div>
        <ProductActionButton
          compact
          tone="secondary"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-1"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {translate(
            expanded ? 'settings.quickActions.fewerIcons' : 'settings.quickActions.moreIcons'
          )}
        </ProductActionButton>
      </div>
    </div>
  );
}

export function QuickActionsEditorPrimaryCaptureFields(props: { state: QuickActionsSectionState }) {
  return (
    <div className="sniptale-parameter-stack">
      <SettingsControlRow label={translate('settings.quickActions.hotkeyLabel')}>
        <HotkeyInput
          value={props.state.editForm?.hotkey ?? null}
          onChange={(hotkey) => props.state.updateFormField('hotkey', hotkey)}
          onError={props.state.handleHotkeyError}
          placeholder={translate('settings.quickActions.hotkeyPlaceholder')}
        />
      </SettingsControlRow>

      <SettingsControlRow label={translate('settings.quickActions.screenshotModeLabel')}>
        <ProductSelect
          controlSize="sm"
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
            {
              value: 'desktop',
              label: translate('settings.quickActions.screenshotModeDesktop'),
            },
          ]}
        />
      </SettingsControlRow>
    </div>
  );
}

export function QuickActionsEditorSecondaryCaptureFields(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  if (props.state.editForm?.screenshotMode === 'desktop') {
    return null;
  }

  const viewportPresetOptions = buildViewportPresetOptions(props.viewportPresets);

  return (
    <div className="sniptale-parameter-stack">
      <SettingsControlRow label={translate('settings.quickActions.screenEmulationLabel')}>
        <ProductSelect
          controlSize="sm"
          menuClassName="!max-h-52"
          menuPlacement="auto"
          menuScrollable
          value={props.state.editForm?.viewportPresetId ?? ''}
          onChange={(value) => props.state.updateFormField('viewportPresetId', value || null)}
          options={viewportPresetOptions}
        />
      </SettingsControlRow>

      <SettingsControlRow label={translate('settings.quickActions.delayLabel')}>
        <ProductSelect
          controlSize="sm"
          value={props.state.editForm?.delay === null ? '' : String(props.state.editForm?.delay)}
          onChange={(value) =>
            props.state.updateFormField(
              'delay',
              value === '' ? null : (parseInt(value, 10) as QuickActionDelay)
            )
          }
          options={[
            { value: '', label: translate('settings.quickActions.followSettingsPlaceholder') },
            ...delayOptions.map((option) => ({
              value: String(option.value),
              label: option.label,
            })),
          ]}
        />
      </SettingsControlRow>
    </div>
  );
}
