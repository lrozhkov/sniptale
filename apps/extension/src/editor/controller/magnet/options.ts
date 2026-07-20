import type { EditorMagnetGuidelineConfig } from './aligning-guidelines';

export const DEFAULT_EDITOR_MAGNET_OPTIONS: Readonly<EditorMagnetGuidelineConfig> = {
  margin: 6,
  width: 1,
  color: 'rgba(14, 165, 233, 0.88)',
  xSize: 4,
  lineDash: [4, 4],
  closeVLine: false,
  closeHLine: false,
};
