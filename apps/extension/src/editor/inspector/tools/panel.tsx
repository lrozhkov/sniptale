import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { renderSelectionActionsSectionWithController } from './sections';
import { panelButtonClassName } from './helpers';
import type { EditorInspectorToolsPanelProps } from './types';
import { renderToolInspector } from './tool-inspector';

export const EditorInspectorToolsPanel: React.FC<EditorInspectorToolsPanelProps> = ({
  selection,
  highlightedTool,
  canDeleteSelection,
  cropReady,
  selectionDuplicateIcon,
  selectionDeleteIcon,
  ...toolProps
}) => {
  useAppLocale();
  const controller = useEditorController();

  const selectionActionProps = {
    selection,
    selectionDuplicateIcon,
    selectionDeleteIcon,
    canDeleteSelection,
    panelButtonClassName,
  };

  return (
    <>
      {renderSelectionActionsSectionWithController(selectionActionProps, controller)}
      {renderToolInspector(controller, highlightedTool, {
        selection,
        highlightedTool,
        canDeleteSelection,
        cropReady,
        selectionDuplicateIcon,
        selectionDeleteIcon,
        ...toolProps,
      })}
    </>
  );
};
