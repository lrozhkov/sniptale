import type React from 'react';
import type { EditorTool } from '../../../../../features/editor/document/types';
import { translate } from '../../../../../platform/i18n';
import type { ImageEditorController } from '../../../../controller';
import { renderCropControlsSection, renderStepControlsSection } from '../../controls';
import {
  primaryPanelButtonClassName,
  renderDefaultToolInspector,
  secondaryPanelButtonClassName,
} from '../../helpers';
import { PanelSection } from '../../sections';
import type { EditorInspectorToolsPanelProps } from '../../types';
import { renderRichShapeControlsSection } from '../../rich-shape';
import { createStepControlsProps } from '../../tool-props';

export function renderToolInspector(
  controller: Pick<
    ImageEditorController,
    'applyCropSelection' | 'cancelCropMode' | 'insertRichShape' | 'resizeLayer'
  >,
  highlightedTool: EditorTool,
  props: EditorInspectorToolsPanelProps
) {
  const richShapeBranch = renderRichShapeSelectionBranch(props);
  if (richShapeBranch) return richShapeBranch;
  if (highlightedTool === 'step') return renderStepControlsSection(createStepControlsProps(props));
  if (highlightedTool === 'crop') {
    return renderCropControlsSection({
      controller,
      cropReady: props.cropReady,
      primaryPanelButtonClassName,
      secondaryPanelButtonClassName,
    });
  }
  return renderDefaultToolInspector();
}

function renderRichShapeSelectionBranch(
  props: EditorInspectorToolsPanelProps
): React.ReactNode | null {
  if (props.selection?.selectedObjectType !== 'rich-shape') return null;
  if (!props.richShapeSelection && props.selection.selectedObjectCount > 1) {
    return (
      <PanelSection
        label={translate('editor.compact.richShapeMultipleSelection')}
        value={translate('editor.compact.richShapeUnsupported')}
      >
        <p className="text-xs leading-5 text-[color:var(--sniptale-color-text-secondary)]">
          {translate('editor.compact.richShapeMultipleSelectionHint')}
        </p>
      </PanelSection>
    );
  }
  if (!props.richShapeSelection) return null;
  return renderRichShapeControlsSection({
    applyRichShapePatch: props.applyRichShapePatch,
    arrangeSelection: props.arrangeSelection,
    recentColors: props.recentColors,
    shape: props.richShapeSelection,
    shapeFillPalette: props.shapeFillPalette,
    shapeStrokePalette: props.shapeStrokePalette,
    textColorPalette: props.textColorPalette,
    toNumber: props.toNumber,
    updateColor: props.updateColor,
  });
}
