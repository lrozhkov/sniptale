import type {
  NativeAudioSourceMode,
  NativeCaptureSettings,
  NativeVideoFrameRate,
} from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n';
import { ProductField, ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { settingsMetaLabelClassName } from '../../section-surface';
import { ToggleRow } from './toggle-row';

const frameRateOptions: NativeVideoFrameRate[] = ['auto', 24, 30, 60];
const audioSourceOptions: NativeAudioSourceMode[] = ['microphone', 'system', 'mixed'];
const audioSourceLabelKeys: Record<NativeAudioSourceMode, Parameters<typeof translate>[0]> = {
  microphone: 'settings.nativeApp.audioSourceMicrophone',
  system: 'settings.nativeApp.audioSourceSystem',
  mixed: 'settings.nativeApp.audioSourceMixed',
};

type UpdateAdvanced = (advanced: Partial<NativeCaptureSettings['video']['advanced']>) => void;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseOptionalBitrate(value: string): number | null {
  if (value === '') {
    return null;
  }
  return clampNumber(Number(value), 2, 80);
}

function FrameRateField(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <ProductField label={translate('settings.nativeApp.frameRate')}>
      <ProductSelect
        aria-label={translate('settings.nativeApp.frameRate')}
        disabled={props.disabled}
        value={String(props.settings.video.advanced.frameRate)}
        options={frameRateOptions.map((option) => ({
          label:
            option === 'auto' ? translate('settings.nativeApp.autoFrameRate') : `${option} FPS`,
          value: String(option),
        }))}
        onChange={(value) => {
          props.updateAdvanced({
            frameRate: value === 'auto' ? 'auto' : (Number(value) as 24 | 30 | 60),
          });
        }}
      />
    </ProductField>
  );
}

function AudioBitrateField(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <ProductField label={translate('settings.nativeApp.audioBitrate')}>
      <ProductSelect
        aria-label={translate('settings.nativeApp.audioBitrate')}
        disabled={props.disabled}
        value={String(props.settings.video.advanced.audioBitrateKbps)}
        options={[96, 128, 160, 192].map((value) => ({
          label: `${value} ${translate('settings.nativeApp.audioBitrateUnit')}`,
          value: String(value),
        }))}
        onChange={(value) =>
          props.updateAdvanced({
            audioBitrateKbps: Number(value) as 96 | 128 | 160 | 192,
          })
        }
      />
    </ProductField>
  );
}

function AudioSourceField(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <ProductField label={translate('settings.nativeApp.audioSourceMode')}>
      <ProductSelect
        aria-label={translate('settings.nativeApp.audioSourceMode')}
        disabled={props.disabled}
        value={props.settings.video.advanced.audioSourceMode}
        options={audioSourceOptions.map((value) => ({
          label: translate(audioSourceLabelKeys[value]),
          value,
        }))}
        onChange={(value) =>
          props.updateAdvanced({ audioSourceMode: value as NativeAudioSourceMode })
        }
      />
    </ProductField>
  );
}

function BitrateOverrideField(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <ProductField
      label={translate('settings.nativeApp.bitrateOverride')}
      hint={translate('settings.nativeApp.bitrateOverrideHint')}
    >
      <ProductInput
        key={props.settings.video.advanced.videoBitrateMbpsOverride ?? 'auto'}
        defaultValue={props.settings.video.advanced.videoBitrateMbpsOverride ?? ''}
        disabled={props.disabled}
        max={80}
        min={2}
        type="number"
        onValueCommit={(value) =>
          props.updateAdvanced({ videoBitrateMbpsOverride: parseOptionalBitrate(value) })
        }
      />
    </ProductField>
  );
}

function MaxDurationField(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <ProductField label={translate('settings.nativeApp.maxDuration')}>
      <ProductInput
        key={props.settings.video.advanced.maxDurationMinutes}
        defaultValue={props.settings.video.advanced.maxDurationMinutes}
        disabled={props.disabled}
        max={720}
        min={1}
        type="number"
        onValueCommit={(value) => {
          const maxDurationMinutes = Math.floor(clampNumber(Number(value), 1, 720));
          props.updateAdvanced({ maxDurationMinutes });
        }}
      />
    </ProductField>
  );
}

export function NativeAdvancedFields(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FrameRateField {...props} />
      <AudioSourceField {...props} />
      <AudioBitrateField {...props} />
      <BitrateOverrideField {...props} />
      <MaxDurationField {...props} />
    </div>
  );
}

export function NativeAdvancedToggles(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateAdvanced;
}) {
  return (
    <div className="space-y-1">
      <ToggleRow
        checked={props.settings.video.advanced.includeCursorInVideo}
        disabled={props.disabled}
        label={translate('settings.nativeApp.includeCursorVideo')}
        onChange={(includeCursorInVideo) => props.updateAdvanced({ includeCursorInVideo })}
      />
      <ToggleRow
        checked={props.settings.video.advanced.preferHardwareEncoder}
        disabled={props.disabled}
        label={translate('settings.nativeApp.preferHardwareEncoder')}
        onChange={(preferHardwareEncoder) => props.updateAdvanced({ preferHardwareEncoder })}
      />
    </div>
  );
}

export function NativeTelemetryFields(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateTelemetry: (telemetry: Partial<NativeCaptureSettings['video']['telemetry']>) => void;
}) {
  return (
    <div className="space-y-1">
      <p className={settingsMetaLabelClassName}>{translate('settings.nativeApp.telemetryTitle')}</p>
      <ToggleRow
        checked={props.settings.video.telemetry.collectCursor}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectCursor')}
        onChange={(collectCursor) => props.updateTelemetry({ collectCursor })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectClicks}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectClicks')}
        onChange={(collectClicks) => props.updateTelemetry({ collectClicks })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectKeyEvents}
        description={translate('settings.nativeApp.keyPrivacy')}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectKeyEvents')}
        onChange={(collectKeyEvents) => props.updateTelemetry({ collectKeyEvents })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectTypingSpans}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectTypingSpans')}
        onChange={(collectTypingSpans) => props.updateTelemetry({ collectTypingSpans })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectStaticSignals}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectStaticSignals')}
        onChange={(collectStaticSignals) => props.updateTelemetry({ collectStaticSignals })}
      />
    </div>
  );
}
