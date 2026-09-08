import { translate } from '../../../platform/i18n';
import { ExportDialogNumberField, ExportDialogSelectFields } from './select-fields';
import type { ExportDialogFieldParams } from './field-contract';

export function ExportDialogFields(params: ExportDialogFieldParams) {
  const { capabilities, onChange, selectedClipAvailable, settings, sourceDimensions } = params;

  return (
    <div className="grid gap-2">
      <ExportDialogSelectFields
        capabilities={capabilities}
        settings={settings}
        sourceDimensions={sourceDimensions}
        onChange={onChange}
        selectedClipAvailable={selectedClipAvailable}
      />
      <ExportDialogNumberField
        label={translate('videoEditor.exportDialog.fpsLabel')}
        min={12}
        max={60}
        step={1}
        value={settings.fps}
        onChange={(value) => onChange({ fps: value })}
      />
    </div>
  );
}
