import { translate } from '../../../../../platform/i18n';
import { SizeControlsHeader, SizeControlsRow } from '../../../size-controls';
import type { EditorExportImageSizeState } from '../../export-image-size';

export function EditorDocumentExportPreferencesImageSizeRow(props: {
  sizeState: EditorExportImageSizeState;
}) {
  return (
    <section
      aria-label={translate('editor.compact.imageSize')}
      className="space-y-2 border-b border-[color:var(--sniptale-color-border-soft)] pb-3"
    >
      <SizeControlsHeader
        label={translate('editor.compact.imageSize')}
        valueText={`${props.sizeState.draft.width} × ${props.sizeState.draft.height}`}
        valueClassName="text-[11px] normal-case tracking-normal"
      />
      <SizeControlsRow
        width={props.sizeState.draft.width}
        height={props.sizeState.draft.height}
        locked={props.sizeState.locked}
        onWidthChange={props.sizeState.setWidth}
        onHeightChange={props.sizeState.setHeight}
        onToggleLock={() => props.sizeState.setLocked((current) => !current)}
        dataUi="editor.file-actions.export-size"
        widthInputDataUi="editor.file-actions.export-size.width"
        heightInputDataUi="editor.file-actions.export-size.height"
      />
    </section>
  );
}
