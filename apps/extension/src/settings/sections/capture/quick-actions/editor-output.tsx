import { translate } from '../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { CaptureActionType, QuickAction } from '../../../../contracts/settings';
import { afterCaptureLabels, qualityOptions } from './section/constants';
import { CheckboxField } from '../../../../ui/compact-inspector-controls';
import { SettingsControlRow } from '../../../section-surface';
import { type QuickActionsSectionState } from './controller';
import { getAllowedQuickActionAfterCaptureActions } from '../../../../features/quick-actions-presets/policy';

type QuickActionsEditorOutputState = Pick<QuickActionsSectionState, 'editForm' | 'updateFormField'>;

export function QuickActionsEditorPrimaryOutputField(props: {
  state: QuickActionsEditorOutputState;
}) {
  return (
    <div>
      <QuickActionsAfterCaptureField state={props.state} />
    </div>
  );
}

export function QuickActionsEditorAdvancedOutputFields(props: {
  state: QuickActionsEditorOutputState;
}) {
  if (props.state.editForm?.afterCapture === 'copy') {
    return null;
  }

  return (
    <div className="mt-3 sniptale-parameter-stack">
      <QuickActionsFormatField state={props.state} />
      <QuickActionsQualityField state={props.state} />
    </div>
  );
}

export function QuickActionsEditorToggleRow(props: {
  state: QuickActionsEditorOutputState;
  includeExitAfterCapture?: boolean;
}) {
  return (
    <div className="sniptale-parameter-stack">
      {props.includeExitAfterCapture ? (
        <QuickActionsBooleanToggle
          checked={Boolean(props.state.editForm?.exitAfterCapture)}
          label={translate('settings.quickActions.exitAfterCaptureLabel')}
          onToggle={() =>
            props.state.updateFormField('exitAfterCapture', !props.state.editForm?.exitAfterCapture)
          }
        />
      ) : null}
    </div>
  );
}

function QuickActionsFormatField(props: { state: QuickActionsEditorOutputState }) {
  return (
    <SettingsControlRow label={translate('settings.quickActions.imageFormatLabel')}>
      <ProductSelect
        controlSize="sm"
        value={props.state.editForm?.imageFormat || ''}
        onChange={(value) =>
          props.state.updateFormField('imageFormat', (value || null) as QuickAction['imageFormat'])
        }
        placeholder={translate('settings.quickActions.followSettingsPlaceholder')}
        options={[
          { value: '', label: translate('settings.quickActions.followSettingsPlaceholder') },
          { value: 'png', label: translate('imageSettings.section.formatPngLabel') },
          { value: 'jpeg', label: translate('imageSettings.section.formatJpegLabel') },
          { value: 'webp', label: translate('imageSettings.section.formatWebpLabel') },
        ]}
      />
    </SettingsControlRow>
  );
}

function QuickActionsQualityField(props: { state: QuickActionsEditorOutputState }) {
  return (
    <SettingsControlRow label={translate('settings.quickActions.qualityLabel')}>
      <ProductSelect
        controlSize="sm"
        value={
          props.state.editForm?.imageQuality === null
            ? ''
            : String(props.state.editForm?.imageQuality)
        }
        onChange={(value) =>
          props.state.updateFormField('imageQuality', value === '' ? null : parseInt(value, 10))
        }
        disabled={!props.state.editForm?.imageFormat || props.state.editForm.imageFormat === 'png'}
        placeholder={translate('settings.quickActions.followSettingsPlaceholder')}
        options={[
          { value: '', label: translate('settings.quickActions.followSettingsPlaceholder') },
          ...qualityOptions.map((option) => ({
            value: String(option.value),
            label: option.label,
          })),
        ]}
      />
    </SettingsControlRow>
  );
}

function QuickActionsAfterCaptureField(props: { state: QuickActionsEditorOutputState }) {
  const allowedActions = props.state.editForm
    ? getAllowedQuickActionAfterCaptureActions(props.state.editForm)
    : null;
  return (
    <SettingsControlRow label={translate('settings.quickActions.afterCaptureLabel')}>
      <ProductSelect
        controlSize="sm"
        value={props.state.editForm?.afterCapture ?? 'download_default'}
        onChange={(value) =>
          props.state.updateFormField('afterCapture', value as CaptureActionType)
        }
        options={(Object.entries(afterCaptureLabels) as [CaptureActionType, string][])
          .filter(
            ([value]) => value !== 'scenario' && (!allowedActions || allowedActions.has(value))
          )
          .map(([value, label]) => ({ value, label }))}
      />
    </SettingsControlRow>
  );
}

function QuickActionsBooleanToggle(props: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return <CheckboxField label={props.label} value={props.checked} onChange={props.onToggle} />;
}
