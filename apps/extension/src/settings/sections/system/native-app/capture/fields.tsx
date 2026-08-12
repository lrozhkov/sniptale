import type {
  NativeAudioSourceMode,
  NativeCaptureSettings,
  NativeVideoFrameRate,
} from '@sniptale/runtime-contracts/video/types/types';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../../../platform/i18n';
import { SettingsControlRow } from '../../../../section-surface';
import { ToggleRow } from '../components/toggle-row';

const frameRateOptions: NativeVideoFrameRate[] = ['auto', 24, 30, 60];
const audioSourceOptions: NativeAudioSourceMode[] = ['microphone', 'system', 'mixed'];
const audioSourceLabelKeys: Record<NativeAudioSourceMode, Parameters<typeof translate>[0]> = {
  microphone: 'settings.nativeApp.audioSourceMicrophone',
  system: 'settings.nativeApp.audioSourceSystem',
  mixed: 'settings.nativeApp.audioSourceMixed',
};

type UpdateNativeAdvanced = (advanced: Partial<NativeCaptureSettings['video']['advanced']>) => void;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseOptionalBitrate(value: string): number | null {
  return value === '' ? null : clampNumber(Number(value), 2, 80);
}

export function NativeAdvancedFields(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateAdvanced: UpdateNativeAdvanced;
}) {
  return (
    <>
      <div className="space-y-1">
        <SettingsControlRow label={translate('settings.nativeApp.frameRate')}>
          <ProductSelect
            aria-label={translate('settings.nativeApp.frameRate')}
            disabled={props.disabled}
            value={String(props.settings.video.advanced.frameRate)}
            options={frameRateOptions.map((option) => ({
              label:
                option === 'auto' ? translate('settings.nativeApp.autoFrameRate') : `${option} FPS`,
              value: String(option),
            }))}
            onChange={(value) =>
              props.updateAdvanced({
                frameRate: value === 'auto' ? 'auto' : (Number(value) as 24 | 30 | 60),
              })
            }
          />
        </SettingsControlRow>
        <SettingsControlRow label={translate('settings.nativeApp.audioSourceMode')}>
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
        </SettingsControlRow>
        <SettingsControlRow label={translate('settings.nativeApp.audioBitrate')}>
          <ProductSelect
            aria-label={translate('settings.nativeApp.audioBitrate')}
            disabled={props.disabled}
            value={String(props.settings.video.advanced.audioBitrateKbps)}
            options={[96, 128, 160, 192].map((value) => ({
              label: `${value} ${translate('settings.nativeApp.audioBitrateUnit')}`,
              value: String(value),
            }))}
            onChange={(value) =>
              props.updateAdvanced({ audioBitrateKbps: Number(value) as 96 | 128 | 160 | 192 })
            }
          />
        </SettingsControlRow>
        <SettingsControlRow
          label={translate('settings.nativeApp.bitrateOverride')}
          description={translate('settings.nativeApp.bitrateOverrideHint')}
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
        </SettingsControlRow>
        <SettingsControlRow label={translate('settings.nativeApp.maxDuration')}>
          <ProductInput
            key={props.settings.video.advanced.maxDurationMinutes}
            defaultValue={props.settings.video.advanced.maxDurationMinutes}
            disabled={props.disabled}
            max={720}
            min={1}
            type="number"
            onValueCommit={(value) =>
              props.updateAdvanced({
                maxDurationMinutes: Math.floor(clampNumber(Number(value), 1, 720)),
              })
            }
          />
        </SettingsControlRow>
      </div>
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
    </>
  );
}
