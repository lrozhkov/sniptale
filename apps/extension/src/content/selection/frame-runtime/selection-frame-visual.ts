import type { ResolvedBorderPresetVisual } from '../../../features/highlighter/style';
import { DEFAULT_COLOR_INFO_STRONG } from '@sniptale/ui/default-colors/constants';

const SELECTION_FRAME_VISUAL: ResolvedBorderPresetVisual = {
  customCss: '',
  customCssStyles: {},
  fillColor: '#00000000',
  fillOpacity: 0,
  id: 'selection-frame',
  inheritCustomCss: false,
  opacity: 100,
  padding: { bottom: 0, left: 0, right: 0, top: 0 },
  radius: 0,
  shadow: 0,
  strokeColor: DEFAULT_COLOR_INFO_STRONG,
  strokeOpacity: 100,
  strokeStyle: 'solid',
  strokeWidth: 2,
};

export function getSelectionFrameVisual(): ResolvedBorderPresetVisual {
  return SELECTION_FRAME_VISUAL;
}
