import { translate } from '../../../platform/i18n';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { ExportDialogNumberField, ExportDialogSelectFields } from './select-fields';

export function ExportDialogFields(params: {
  capabilities: VideoExportCapabilities | null | undefined;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
  selectedClipAvailable: boolean;
  settings: VideoProjectExportSettings;
}) {
  const { capabilities, onChange, selectedClipAvailable, settings } = params;

  return (
    <div className="grid grid-cols-2 gap-4">
      <ExportDialogSelectFields
        capabilities={capabilities}
        settings={settings}
        onChange={onChange}
        selectedClipAvailable={selectedClipAvailable}
      />
      <ExportDialogNumberField
        label={translate('videoEditor.exportDialog.widthLabel')}
        min={320}
        step={2}
        value={settings.width}
        onChange={(value) => onChange({ width: value })}
      />
      <ExportDialogNumberField
        label={translate('videoEditor.exportDialog.heightLabel')}
        min={180}
        step={2}
        value={settings.height}
        onChange={(value) => onChange({ height: value })}
      />
      <ExportDialogNumberField
        label={translate('videoEditor.exportDialog.fpsLabel')}
        min={12}
        max={60}
        step={1}
        value={settings.fps}
        onChange={(value) => onChange({ fps: value })}
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}
