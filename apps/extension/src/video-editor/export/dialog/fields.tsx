import { translate } from '../../../platform/i18n';
import { StatusRow } from '../../../ui/compact-inspector-controls';
import { ExportDialogNumberField, ExportDialogSelectFields } from './select-fields';
import type { ExportDialogFieldParams } from './field-contract';

export function ExportDialogFields(params: ExportDialogFieldParams) {
  const { capabilities, onChange, selectedClipAvailable, settings, sourceDimensions } = params;

  return (
    <div className="grid grid-cols-2 gap-4">
      <ExportDialogSelectFields
        capabilities={capabilities}
        settings={settings}
        sourceDimensions={sourceDimensions}
        onChange={onChange}
        selectedClipAvailable={selectedClipAvailable}
      />
      <StatusRow
        label={translate('videoEditor.exportDialog.outputSizeLabel')}
        value={`${settings.width} × ${settings.height}`}
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
