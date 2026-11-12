import { DEFAULT_COLOR_CANVAS_MAGNET } from '@sniptale/ui/default-colors/constants';
import type { EditorMagnetGuidelineConfig } from './aligning-guidelines';

export const DEFAULT_EDITOR_MAGNET_OPTIONS: Readonly<EditorMagnetGuidelineConfig> = {
  margin: 6,
  width: 1,
  color: DEFAULT_COLOR_CANVAS_MAGNET,
  xSize: 4,
  lineDash: [4, 3],
  closeVLine: false,
  closeHLine: false,
};
