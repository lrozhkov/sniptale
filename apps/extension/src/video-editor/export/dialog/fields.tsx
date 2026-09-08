import { ExportDialogSelectFields } from './select-fields';
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
    </div>
  );
}
