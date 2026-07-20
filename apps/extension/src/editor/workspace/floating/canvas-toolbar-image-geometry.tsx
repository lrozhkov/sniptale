import { Scaling } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { CompactCommandField } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';
import {
  CANVAS_TOOLBAR_GROUP_TITLES,
  CANVAS_TOOLBAR_GROUP_WIDTHS,
  type FloatingToolbarGroup,
  getCanvasToolbarGroupTrigger,
} from './canvas-toolbar-model';

export function createCanvasToolbarImageGeometryGroup(args: {
  documentController: EditorFloatingDocumentController;
  selection: EditorToolbarSelectionState;
}): FloatingToolbarGroup | null {
  if (!args.documentController.isResizableLayerSelection || !args.selection.selectedObjectId) {
    return null;
  }

  return {
    id: 'geometry',
    kind: 'geometry',
    title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
    trigger: getCanvasToolbarGroupTrigger('geometry', []) ?? <Scaling size={15} strokeWidth={2} />,
    content: <ImageGeometryContent {...args} />,
    width: CANVAS_TOOLBAR_GROUP_WIDTHS.geometry,
  };
}

function ImageGeometryContent(args: {
  documentController: EditorFloatingDocumentController;
  selection: EditorToolbarSelectionState;
}) {
  return (
    <CompactCommandField label={CANVAS_TOOLBAR_GROUP_TITLES.geometry} hideLabel>
      <div className="space-y-3">
        <ImageGeometryDimensionGrid documentController={args.documentController} />
        <ImageGeometryApplyButton {...args} />
      </div>
    </CompactCommandField>
  );
}

function ImageGeometryDimensionGrid({
  documentController,
}: {
  documentController: EditorFloatingDocumentController;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <documentController.DimensionInput
        label={translate('editor.compact.widthDimension')}
        value={documentController.layerSizeDraft.width}
        min={1}
        onChange={(value) =>
          documentController.setLayerSizeDraft((state) =>
            documentController.updateLockedDraft(
              state,
              'width',
              value,
              documentController.layerSizeLocked,
              documentController.layerAspectRatio
            )
          )
        }
      />
      <documentController.DimensionInput
        label={translate('editor.compact.heightDimension')}
        value={documentController.layerSizeDraft.height}
        min={1}
        onChange={(value) =>
          documentController.setLayerSizeDraft((state) =>
            documentController.updateLockedDraft(
              state,
              'height',
              value,
              documentController.layerSizeLocked,
              documentController.layerAspectRatio
            )
          )
        }
      />
    </div>
  );
}

function ImageGeometryApplyButton(args: {
  documentController: EditorFloatingDocumentController;
  selection: EditorToolbarSelectionState;
}) {
  const { documentController } = args;
  const className = [
    'w-full rounded-[10px] bg-[var(--sniptale-color-accent)] px-3 py-2',
    'text-sm font-semibold text-[var(--sniptale-color-on-accent)]',
  ].join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const layerId = args.selection.selectedObjectId;
        if (layerId) {
          void documentController.onResizeLayer(
            layerId,
            documentController.layerSizeDraft.width,
            documentController.layerSizeDraft.height
          );
        }
      }}
    >
      {translate('editor.toolbar.layerEffectsApplyResize')}
    </button>
  );
}
