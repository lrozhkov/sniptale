import { translate } from '../../../platform/i18n';
import { SlidersHorizontal } from 'lucide-react';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type { EditorObjectType, EditorTool } from '../../../features/editor/document/types';
import type { EditorInspector } from '../../state/types';
import { TOOL_ICONS, getToolLabel, mapObjectTypeToTool } from '../../chrome/tool-icons';
import { createInspectorMeta, type EditorInspectorMeta } from './shared';
import { getInspectorModeMeta } from './modes';

interface EditorInspectorMetaOptions {
  inspector: EditorInspector;
  activeTool: EditorTool;
  isSelectionInspector: boolean;
  layerEffectsCategory?: EditorLayerEffectCategory;
  selectedObjectLabel?: string | null;
  selectedObjectType: EditorObjectType | null;
}

function resolveToolTitle(tool: EditorTool): string {
  return getToolLabel(tool) ?? translate('editor.toolbar.inspectorFallback');
}

export function getEditorInspectorMeta({
  inspector,
  activeTool,
  isSelectionInspector,
  layerEffectsCategory,
  selectedObjectLabel,
  selectedObjectType,
}: EditorInspectorMetaOptions): EditorInspectorMeta {
  const inspectorModeMeta = getInspectorModeMeta(
    inspector,
    layerEffectsCategory === undefined ? undefined : { layerEffectsCategory }
  );
  if (inspectorModeMeta) {
    return inspectorModeMeta;
  }

  if (isSelectionInspector) {
    const tool = mapObjectTypeToTool(selectedObjectType);
    const title =
      selectedObjectType === 'rich-shape' && selectedObjectLabel
        ? selectedObjectLabel
        : resolveToolTitle(tool);

    return createInspectorMeta(
      `${translate('editor.toolbar.selectionObjectPrefix')} ${title}`,
      selectedObjectType === 'arrow'
        ? translate('editor.toolbar.selectionArrowSubtitle')
        : translate('editor.toolbar.selectionObjectSubtitle'),
      TOOL_ICONS[tool]
    );
  }

  if (activeTool === 'select') {
    return createInspectorMeta(
      translate('editor.toolbar.inspectorTitle'),
      translate('editor.toolbar.inspectorSubtitle'),
      <SlidersHorizontal size={18} strokeWidth={2} />
    );
  }

  return createInspectorMeta(
    `${translate('editor.toolbar.toolPrefix')} ${resolveToolTitle(activeTool)}`,
    translate('editor.toolbar.toolSubtitle'),
    TOOL_ICONS[activeTool]
  );
}
