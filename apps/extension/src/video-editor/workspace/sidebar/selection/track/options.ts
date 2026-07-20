import { translate } from '../../../../../platform/i18n';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import { VideoSubtitlePlacement } from '../../../../../features/video/project/types';

export function getSubtitlePlacementOptions() {
  const options: GlassSelectOption<VideoSubtitlePlacement>[] = [
    {
      label: translate('videoEditor.sidebar.subtitlePlacementBottom'),
      value: VideoSubtitlePlacement.BOTTOM,
    },
    {
      label: translate('videoEditor.sidebar.subtitlePlacementTop'),
      value: VideoSubtitlePlacement.TOP,
    },
  ];
  return options;
}
