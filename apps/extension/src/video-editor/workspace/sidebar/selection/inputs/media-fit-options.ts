import { translate } from '../../../../../platform/i18n';
import { VideoMediaFitMode } from '../../../../../features/video/project/types';

type MediaFitModeOption = {
  label: string;
  value: VideoMediaFitMode;
};

export function getMediaFitModeOptions() {
  return [
    {
      value: VideoMediaFitMode.CONTAIN,
      label: translate('videoEditor.sidebar.fitModeContain'),
    },
    {
      value: VideoMediaFitMode.SOURCE_100,
      label: translate('videoEditor.sidebar.fitModeSource100'),
    },
    {
      value: VideoMediaFitMode.FIT_LONG_SIDE,
      label: translate('videoEditor.sidebar.fitModeLongSide'),
    },
    {
      value: VideoMediaFitMode.FIT_SHORT_SIDE,
      label: translate('videoEditor.sidebar.fitModeShortSide'),
    },
    {
      value: VideoMediaFitMode.COVER,
      label: translate('videoEditor.sidebar.fitModeCover'),
    },
    {
      value: VideoMediaFitMode.STRETCH,
      label: translate('videoEditor.sidebar.fitModeStretch'),
    },
  ] satisfies MediaFitModeOption[];
}

export function getLegacyMediaFitModeOptions() {
  return getMediaFitModeOptions().filter((option) => isLegacyMediaFitModeOption(option.value));
}

export function normalizeLegacyMediaFitMode(fitMode: VideoMediaFitMode) {
  return isLegacyMediaFitModeOption(fitMode) ? fitMode : VideoMediaFitMode.CONTAIN;
}

function isLegacyMediaFitModeOption(fitMode: VideoMediaFitMode) {
  return (
    fitMode === VideoMediaFitMode.CONTAIN ||
    fitMode === VideoMediaFitMode.SOURCE_100 ||
    fitMode === VideoMediaFitMode.FIT_LONG_SIDE ||
    fitMode === VideoMediaFitMode.FIT_SHORT_SIDE
  );
}
