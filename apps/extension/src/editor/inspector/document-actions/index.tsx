import React from 'react';
import { translate } from '../../../platform/i18n';
import type { SavePreset } from '../../../contracts/settings';
import { useEditorEmbedContext } from '../../application/embed-context/context';
import { useEditorExportImageSizeState } from './export-image-size';
import type { EditorInspectorDocumentActionsProps } from './props';
import { useEditorExportSettingsState } from './export-settings';
import { buildEditorDocumentActionGroups } from './model/build';
import { EditorDocumentImageFormatContent } from './disclosures';
import { EditorDocumentSaveToFolderDisclosure } from './save-to-folder-disclosure';
import { resolvePresetFeedbackState, useDocumentActionFeedback } from './feedback';
import { EditorDocumentActionGroupSection } from './sections';
import { documentActionsSurfaceClassName } from './shared';

function resolveCopyDisabledReason(
  props: Pick<EditorInspectorDocumentActionsProps, 'copyRenderedImageDisabledReason'>,
  exportSettings: ReturnType<typeof useEditorExportSettingsState>
) {
  return (
    props.copyRenderedImageDisabledReason ??
    (exportSettings.isClipboardCopySupported
      ? null
      : translate('editor.documentActions.copyFormatUnsupported'))
  );
}

function renderSavePresetDisclosure(args: {
  defaultImagePresetId: string | null;
  feedbackPresetId: string | null;
  onSaveToPreset: (presetId: string) => Promise<void> | void;
  savePresets: SavePreset[];
  savingPresetId: string | null;
}) {
  return (
    <EditorDocumentSaveToFolderDisclosure
      defaultImagePresetId={args.defaultImagePresetId}
      feedbackPresetId={args.feedbackPresetId}
      savePresets={args.savePresets}
      savingPresetId={args.savingPresetId}
      onSaveToPreset={args.onSaveToPreset}
    />
  );
}

function useEditorDocumentActionGroups(props: EditorInspectorDocumentActionsProps) {
  const exportSettings = useEditorExportSettingsState();
  const exportSize = useEditorExportImageSizeState(props.canvasSize);
  const { feedbackActionId, feedbackStatus, getActionStatus, runActionFeedback } =
    useDocumentActionFeedback();
  const { feedbackPresetId, savingPresetId } = resolvePresetFeedbackState(
    feedbackActionId,
    feedbackStatus
  );
  const embed = useEditorEmbedContext();
  const copyRenderedImageDisabledReason = resolveCopyDisabledReason(props, exportSettings);
  const renderOptions = { outputSize: exportSize.draft };

  const groups = buildEditorDocumentActionGroups({
    defaultImagePresetId: props.defaultImagePresetId,
    renderSavePresetOptions: () =>
      renderSavePresetDisclosure({
        defaultImagePresetId: props.defaultImagePresetId,
        feedbackPresetId,
        onSaveToPreset: (presetId) =>
          runActionFeedback(`save-to-folder:${presetId}`, () =>
            props.onSaveToPreset(presetId, renderOptions)
          ),
        savePresets: props.savePresets,
        savingPresetId,
      }),
    renderImageFormat: () => (
      <EditorDocumentImageFormatContent settings={exportSettings} sizeState={exportSize} />
    ),
    savePresets: props.savePresets,
    onCloseDocument: props.onCloseDocument,
    onCopyRenderedImage: () =>
      runActionFeedback('copy-png', () => props.onCopyRenderedImage(renderOptions)),
    onExportSession: props.onExportSession,
    onImportSession: props.onImportSession,
    onOpenImage: props.onOpenImage,
    onSaveImage: () => runActionFeedback('save-image', () => props.onSaveImage(renderOptions)),
    onSaveImageAs: () =>
      runActionFeedback('save-image-as', () => props.onSaveImageAs(renderOptions)),
    copyRenderedImageDisabledReason,
    ...(typeof embed.mode === 'undefined' ? {} : { embedMode: embed.mode }),
    ...(embed.onClose == null ? {} : { onReturnToHost: embed.onClose }),
  });

  return { getActionStatus, groups };
}

export const EditorInspectorDocumentActions: React.FC<EditorInspectorDocumentActionsProps> = (
  props
) => {
  const { getActionStatus, groups } = useEditorDocumentActionGroups(props);

  return (
    <div data-ui="editor.file-actions.surface" className={documentActionsSurfaceClassName}>
      {groups.map((group) => (
        <EditorDocumentActionGroupSection
          key={group.id}
          getActionStatus={getActionStatus}
          group={group}
        />
      ))}
    </div>
  );
};
