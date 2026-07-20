import type React from 'react';
import type { EditorTool } from '../../../../../features/editor/document/types';
import { translate } from '../../../../../platform/i18n';
import type { ImageEditorController } from '../../../../controller';
import {
  renderArrowControlsSection,
  renderBlurControlsSection,
  renderBrushControlsSection,
  renderCropControlsSection,
  renderLineControlsSection,
  renderShapeControlsSection,
  renderStepControlsSection,
} from '../../controls';
import {
  primaryPanelButtonClassName,
  renderDefaultToolInspector,
  secondaryPanelButtonClassName,
} from '../../helpers';
import { PanelSection } from '../../sections';
import type { EditorInspectorToolsPanelProps } from '../../types';
import { renderTextControlsSection } from '../../text-sections';
import { renderRichShapeControlsSection } from '../../rich-shape';
import {
  RasterBrushControlsSection,
  RasterEraserControlsSection,
  RasterFillControlsSection,
  RasterSelectionControlsSection,
} from '../../raster';
import {
  createArrowControlsProps,
  createBlurControlsProps,
  createLineControlsProps,
  createShapeControlsProps,
  createStepControlsProps,
  createTextControlsProps,
} from '../../tool-props';
import { renderRoughShapeBranch, renderShapesAndLinesBranch } from './shape-branches';

export function renderToolInspector(
  controller: Pick<
    ImageEditorController,
    'applyCropSelection' | 'cancelCropMode' | 'insertRichShape' | 'resizeLayer'
  >,
  highlightedTool: EditorTool,
  props: EditorInspectorToolsPanelProps
) {
  const richShapeBranch = renderRichShapeSelectionBranch(props);
  if (richShapeBranch) {
    return richShapeBranch;
  }

  return renderHighlightedToolInspector(controller, highlightedTool, props);
}

function renderRichShapeSelectionBranch(
  props: EditorInspectorToolsPanelProps
): React.ReactNode | null {
  if (props.selection?.selectedObjectType !== 'rich-shape') {
    return null;
  }
  if (!props.richShapeSelection && props.selection.selectedObjectCount > 1) {
    return renderRichShapeMultipleSelection();
  }
  if (!props.richShapeSelection) {
    return null;
  }
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

function renderRichShapeMultipleSelection() {
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

function renderHighlightedToolInspector(
  controller: Pick<
    ImageEditorController,
    'applyCropSelection' | 'cancelCropMode' | 'insertRichShape' | 'resizeLayer'
  >,
  highlightedTool: EditorTool,
  props: EditorInspectorToolsPanelProps
) {
  const rasterBranch = renderRasterToolBranch(highlightedTool);
  if (rasterBranch) {
    return rasterBranch;
  }
  const shapeBranch = renderShapeToolBranch(highlightedTool, props);
  if (shapeBranch) {
    return shapeBranch;
  }

  const drawingBranch = renderDrawingToolBranch(highlightedTool, props);
  if (drawingBranch) {
    return drawingBranch;
  }

  return renderRemainingToolBranch(controller, highlightedTool, props);
}

function renderDrawingToolBranch(
  highlightedTool: EditorTool,
  props: EditorInspectorToolsPanelProps
): React.ReactNode | null {
  switch (highlightedTool) {
    case 'blur':
      return renderBlurControlsSection(createBlurControlsProps(props));
    case 'arrow':
      return renderArrowControlsSection(createArrowControlsProps(props));
    case 'line':
      return renderLineControlsSection(createLineControlsProps(props));
    case 'text':
      return renderTextControlsSection(createTextControlsProps(props));
    case 'callout':
      return renderDefaultToolInspector();
    case 'step':
      return renderStepControlsSection(createStepControlsProps(props));
    case 'select':
    case 'selection':
    case 'brush':
    case 'eraser':
    case 'fill':
    case 'image':
    case 'shapes-and-lines':
    case 'rough-shape':
    case 'shape-library':
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'crop':
    case 'pencil':
    case 'highlighter':
      return null;
  }
}

function renderRemainingToolBranch(
  controller: Pick<
    ImageEditorController,
    'applyCropSelection' | 'cancelCropMode' | 'insertRichShape' | 'resizeLayer'
  >,
  highlightedTool: EditorTool,
  props: EditorInspectorToolsPanelProps
): React.ReactNode {
  switch (highlightedTool) {
    case 'shapes-and-lines':
    case 'shape-library':
      return renderShapesAndLinesBranch();
    case 'rough-shape':
      return renderRoughShapeBranch();
    case 'crop':
      return renderCropControlsSection({
        controller,
        cropReady: props.cropReady,
        primaryPanelButtonClassName,
        secondaryPanelButtonClassName,
      });
    case 'select':
    case 'selection':
    case 'brush':
    case 'eraser':
    case 'fill':
    case 'image':
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'blur':
    case 'arrow':
    case 'line':
    case 'text':
    case 'callout':
    case 'step':
    case 'pencil':
    case 'highlighter':
      return renderDefaultToolInspector();
  }
}

function renderRasterToolBranch(highlightedTool: EditorTool): React.ReactNode | null {
  switch (highlightedTool) {
    case 'selection':
      return <RasterSelectionControlsSection />;
    case 'brush':
      return <RasterBrushControlsSection />;
    case 'eraser':
      return <RasterEraserControlsSection />;
    case 'fill':
      return <RasterFillControlsSection />;
    case 'select':
    case 'image':
    case 'shapes-and-lines':
    case 'rough-shape':
    case 'shape-library':
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'blur':
    case 'arrow':
    case 'line':
    case 'text':
    case 'callout':
    case 'step':
    case 'crop':
    case 'pencil':
    case 'highlighter':
      return null;
  }
}

function renderShapeToolBranch(
  highlightedTool: EditorTool,
  props: EditorInspectorToolsPanelProps
): React.ReactNode | null {
  switch (highlightedTool) {
    case 'pencil':
    case 'highlighter':
      return renderBrushControlsSection(highlightedTool, {
        ...props,
        applyBrushPatch: props.applyBrushPatch,
      });
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return renderShapeControlsSection(createShapeControlsProps(props, highlightedTool));
    case 'fill':
    case 'line':
    case 'arrow':
    case 'blur':
    case 'select':
    case 'selection':
    case 'brush':
    case 'eraser':
    case 'shapes-and-lines':
    case 'rough-shape':
    case 'shape-library':
    case 'callout':
    case 'text':
    case 'step':
    case 'image':
    case 'crop':
      return null;
  }
}
