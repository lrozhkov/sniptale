import type { ComponentType } from 'react';
import { Crop, Monitor, ScreenShare, Video } from 'lucide-react';
import { translate, type TranslationKey } from '../../../../../platform/i18n';
import type {
  ActiveTabCapabilities,
  CapabilityState,
} from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { ModeIconButton } from '../primitives';

const CAPTURE_MODE_GRID_CLASS_NAME = 'mr-1 grid grid-cols-4 gap-1.5';
type VisibleCaptureMode =
  | typeof CaptureMode.TAB
  | typeof CaptureMode.TAB_CROP
  | typeof CaptureMode.CAMERA
  | typeof CaptureMode.SCREEN;

const CAPTURE_MODE_META: Record<
  VisibleCaptureMode,
  { hintKey: TranslationKey; accentClassName: string }
> = {
  [CaptureMode.TAB]: {
    hintKey: 'popup.video.modeTabHint',
    accentClassName: 'text-[var(--sniptale-color-accent)]',
  },
  [CaptureMode.TAB_CROP]: {
    hintKey: 'popup.video.modeAreaHint',
    accentClassName: 'text-[var(--sniptale-color-accent)]',
  },
  [CaptureMode.CAMERA]: {
    hintKey: 'popup.video.modeCameraHint',
    accentClassName: 'text-[var(--sniptale-color-accent)]',
  },
  [CaptureMode.SCREEN]: {
    hintKey: 'popup.video.modeScreenHint',
    accentClassName: 'text-[var(--sniptale-color-accent)]',
  },
};

const CAPTURE_MODE_OPTIONS: Array<{
  mode: VisibleCaptureMode;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
}> = [
  { mode: CaptureMode.TAB, labelKey: 'popup.video.modeTabLabel', icon: Monitor },
  {
    mode: CaptureMode.TAB_CROP,
    labelKey: 'popup.video.modeAreaLabel',
    icon: Crop,
  },
  {
    mode: CaptureMode.CAMERA,
    labelKey: 'popup.video.modeCameraLabel',
    icon: Video,
  },
  {
    mode: CaptureMode.SCREEN,
    labelKey: 'popup.video.modeScreenLabel',
    icon: ScreenShare,
  },
];

export function CaptureModeSelector({
  captureMode,
  activeTabCapabilities,
  modeCapabilities,
  onCaptureModeChange,
}: {
  captureMode: CaptureMode;
  activeTabCapabilities?: ActiveTabCapabilities | undefined;
  modeCapabilities?: Record<CaptureMode, CapabilityState> | undefined;
  onCaptureModeChange: (mode: CaptureMode) => void;
}) {
  const resolvedModeCapabilities = modeCapabilities ?? activeTabCapabilities?.videoByMode;
  return (
    <div className={CAPTURE_MODE_GRID_CLASS_NAME}>
      {CAPTURE_MODE_OPTIONS.map(({ mode, labelKey, icon }) => {
        const meta = CAPTURE_MODE_META[mode];
        const modeCapability = resolvedModeCapabilities?.[mode] ?? {
          supported: false,
          reason: translate('popup.common.noActiveTab'),
        };
        const isActive = captureMode === mode;
        const label = translate(labelKey);
        const hint = modeCapability.reason ?? translate(meta.hintKey);

        return (
          <ModeIconButton
            key={mode}
            icon={icon}
            label={label}
            hint={hint}
            active={isActive}
            disabled={!modeCapability.supported}
            accentClassName={meta.accentClassName}
            onClick={() => {
              if (modeCapability.supported) {
                onCaptureModeChange(mode);
              }
            }}
          />
        );
      })}
    </div>
  );
}
