import { Save } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { CompactCommandField, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { buildDimensionCommands } from './dimension-command';
import { EditorDocumentImageFormatContent } from '../../document-actions/disclosures';
import { buildEditorDocumentActionGroups } from '../../document-actions/model/build';
import type { EditorDocumentActionCommand } from '../../document-actions/model/types';

function buildCompactCommand(action: EditorDocumentActionCommand): CompactCommand {
  const Icon = action.icon;

  return {
    danger: action.emphasis === 'danger',
    id: action.id,
    onClick: action.onClick,
    title: action.label,
    trigger: <Icon size={16} strokeWidth={2} />,
    ...(action.meta === undefined ? {} : { value: action.meta }),
  };
}

function buildContentTrigger() {
  return <Save size={16} strokeWidth={2} />;
}

export function buildFileCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  const groups = buildEditorDocumentActionGroups({
    defaultImagePresetId: params.defaultImagePresetId,
    renderImageFormat: () => <EditorDocumentImageFormatContent />,
    renderSavePresetOptions: params.renderSavePresetOptions,
    savePresets: params.savePresets,
    onCloseDocument: params.onCloseDocument,
    onCopyRenderedImage: params.onCopyRenderedImage,
    onExportSession: params.onExportSession,
    onImportSession: params.onImportSession,
    onOpenImage: params.onOpenImage,
    onSaveImage: params.onSaveImage,
    onSaveImageAs: params.onSaveImageAs,
  });

  return groups.flatMap((group) =>
    group.items.map((item) => {
      if (item.kind === 'command') {
        return buildCompactCommand(item);
      }

      const fieldProps = {
        ...(item.note === undefined ? {} : { note: item.note }),
        ...(item.value == null ? {} : { value: item.value }),
      };

      return {
        content: (
          <CompactCommandField label={item.label} {...fieldProps}>
            {item.content}
          </CompactCommandField>
        ),
        id: item.id,
        title: item.label,
        trigger: buildContentTrigger(),
      };
    })
  );
}

export function buildImageSizeCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return buildDimensionCommands({
    applyTitle: translate('editor.compact.applyImageSize'),
    aspectRatio: params.imageAspectRatio,
    label: translate('editor.compact.imageSize'),
    locked: params.imageSizeLocked,
    onApply: () => params.onResizeImage(params.imageSizeDraft.width, params.imageSizeDraft.height),
    setDraft: params.setImageSizeDraft,
    setLocked: params.setImageSizeLocked,
    sizeDraft: params.imageSizeDraft,
    sizeText: params.imageSizeText,
    triggerId: 'image-size',
    updateLockedDraft: params.updateLockedDraft,
  });
}

export function buildCanvasSizeCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return buildDimensionCommands({
    applyTitle: translate('editor.compact.applyCanvasSize'),
    aspectRatio: params.canvasAspectRatio,
    label: translate('editor.compact.canvasSize'),
    locked: params.canvasSizeLocked,
    onApply: () =>
      params.onResizeCanvas(params.canvasSizeDraft.width, params.canvasSizeDraft.height),
    setDraft: params.setCanvasSizeDraft,
    setLocked: params.setCanvasSizeLocked,
    sizeDraft: params.canvasSizeDraft,
    sizeText: params.canvasSizeText,
    triggerId: 'canvas-size',
    updateLockedDraft: params.updateLockedDraft,
  });
}
