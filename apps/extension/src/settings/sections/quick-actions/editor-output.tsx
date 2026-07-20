import { translate } from '../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { CaptureActionType, QuickAction } from '../../../contracts/settings';
import { afterCaptureLabels, qualityOptions } from './section/constants';
import { SettingsSwitch } from '../../section-surface/panel-controls';
import { settingsMetaLabelClassName, settingsToggleRowClassName } from '../../section-surface';
import { type QuickActionsSectionState } from './section';

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
  return (
    <div className="mb-4 grid gap-4 md:grid-cols-2">
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
    <div className="grid gap-3 md:grid-cols-2">
      <QuickActionsBooleanToggle
        checked={Boolean(props.state.editForm?.status)}
        label={translate('settings.quickActions.enabledLabel')}
        onToggle={() => props.state.updateFormField('status', !props.state.editForm?.status)}
      />
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
    <div>
      <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
        {translate('settings.quickActions.imageFormatLabel')}
      </label>
      <ProductSelect
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
    </div>
  );
}

function QuickActionsQualityField(props: { state: QuickActionsEditorOutputState }) {
  return (
    <div>
      <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
        {translate('settings.quickActions.qualityLabel')}
      </label>
      <ProductSelect
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
    </div>
  );
}

function QuickActionsAfterCaptureField(props: { state: QuickActionsEditorOutputState }) {
  return (
    <div>
      <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
        {translate('settings.quickActions.afterCaptureLabel')}
      </label>
      <ProductSelect
        value={props.state.editForm?.afterCapture ?? 'download_default'}
        onChange={(value) =>
          props.state.updateFormField('afterCapture', value as CaptureActionType)
        }
        options={(Object.entries(afterCaptureLabels) as [CaptureActionType, string][]).map(
          ([value, label]) => ({ value, label })
        )}
      />
    </div>
  );
}

function QuickActionsBooleanToggle(props: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className={settingsToggleRowClassName}>
      <label className="text-sm text-[var(--sniptale-color-text-muted)]">{props.label}</label>
      <SettingsSwitch checked={props.checked} onClick={props.onToggle} />
    </div>
  );
}
