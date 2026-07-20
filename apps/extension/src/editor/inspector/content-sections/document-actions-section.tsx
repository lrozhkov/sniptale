import { EditorInspectorDocumentActions } from '../document-actions';
import type { EditorInspectorDocumentActionsProps } from '../document-actions/props';

export interface EditorInspectorDocumentActionsSectionProps extends Omit<
  EditorInspectorDocumentActionsProps,
  'onSaveToPreset'
> {
  saveToPreset: EditorInspectorDocumentActionsProps['onSaveToPreset'];
}

export function EditorInspectorDocumentActionsSection(
  props: EditorInspectorDocumentActionsSectionProps
) {
  const copyDisabledProps =
    props.copyRenderedImageDisabledReason === undefined
      ? {}
      : { copyRenderedImageDisabledReason: props.copyRenderedImageDisabledReason };

  return (
    <div className="space-y-5">
      <EditorInspectorDocumentActions
        canvasSize={props.canvasSize}
        savePresets={props.savePresets}
        defaultImagePresetId={props.defaultImagePresetId}
        onSaveToPreset={props.saveToPreset}
        onSaveImage={props.onSaveImage}
        onSaveImageAs={props.onSaveImageAs}
        onCopyRenderedImage={props.onCopyRenderedImage}
        onOpenImage={props.onOpenImage}
        onCloseDocument={props.onCloseDocument}
        onExportSession={props.onExportSession}
        onImportSession={props.onImportSession}
        {...copyDisabledProps}
      />
    </div>
  );
}
