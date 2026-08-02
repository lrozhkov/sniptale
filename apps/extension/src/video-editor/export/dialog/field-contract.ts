import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
  VideoProjectExportSettingsPatch,
} from '../../../features/video/project/types';

export interface ExportDialogFieldParams {
  capabilities: VideoExportCapabilities | null | undefined;
  onChange: (patch: VideoProjectExportSettingsPatch) => void;
  selectedClipAvailable: boolean;
  settings: VideoProjectExportSettings;
  sourceDimensions: { height: number; width: number };
}
