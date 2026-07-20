import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { EditorInspectorCompactToolbar } from '../compact';
import { EditorInspectorSidebarExpandedContent } from '../sidebar-expanded-content';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { EditorInspectorSidebarHiddenInputs } from './hidden-inputs';
import { useEditorInspectorSidebarController } from '../sidebar-controller';

const editorInspectorPanelStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 98%, transparent)',
};

interface EditorInspectorSidebarProps {
  hasImage: boolean;
}

export const EditorInspectorSidebar: React.FC<EditorInspectorSidebarProps> = ({ hasImage }) => {
  useAppLocale();
  const controller = useEditorInspectorSidebarController(hasImage);

  return (
    <InspectorShellFrame
      collapsed={controller.inspectorCollapsed}
      expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
      collapsedWidthClassName={INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS}
      dataUi="editor.inspector.sidebar-shell"
    >
      <EditorInspectorSidebarHiddenInputs
        openImageInputRef={controller.openImageInputRef}
        importSessionInputRef={controller.importSessionInputRef}
        backgroundImageInputRef={controller.backgroundImageInputRef}
        setImageData={controller.setImageData}
        handleBackgroundImageUpload={controller.handleBackgroundImageUpload}
      />
      <InspectorShellPanel
        style={editorInspectorPanelStyle}
        dataUi="editor.inspector.sidebar-panel"
      >
        {controller.inspectorCollapsed ? (
          <EditorInspectorCompactToolbar
            commandGroups={controller.compactCommandGroups}
            collapsed={controller.inspectorCollapsed}
          />
        ) : (
          <EditorInspectorSidebarExpandedContent hasImage={hasImage} controller={controller} />
        )}
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
};
