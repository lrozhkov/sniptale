import { useEffect, useMemo, useState } from 'react';
import { FloatingChromeRoot } from '@sniptale/ui/floating-chrome';
import type { EditorTool } from '../../../features/editor/document/types';
import { useEditorInspectorSidebarController } from '../../inspector/sidebar-controller';
import { useEditorToolbarController } from '../toolbar/use-controller';
import { EditorCanvasSelectionToolbar } from './canvas-selection-toolbar';
import { EditorFloatingDocumentBar } from './document-bar';
import { EditorFloatingLeftDrawer } from './left-drawer';
import { EditorFloatingWorkspaceOverlays } from './overlays';
import { EditorFloatingRightStack } from './right-stack';
import { resolveFloatingSurfaceRoute } from './routes';
import { EditorFloatingToolRail } from './tool-rail';
import { EditorFloatingToolPropertiesRail } from './tool-properties-rail';
import { EditorFloatingUtilityPanel } from './utility-panel';
import { EditorFloatingViewControls } from './view-controls';
import { getFloatingWorkspaceEdgeInsetStyle, useFloatingWorkspaceEdgeInsets } from './edge-insets';
import { useFloatingLayersPreferenceState } from './preferences';

function useDismissedLeftDrawer(activeTool: EditorTool) {
  const [dismissedLeftDrawerTool, setDismissedLeftDrawerTool] = useState<EditorTool | null>(null);

  useEffect(() => {
    if (dismissedLeftDrawerTool !== null && dismissedLeftDrawerTool !== activeTool) {
      setDismissedLeftDrawerTool(null);
    }
  }, [activeTool, dismissedLeftDrawerTool]);

  return { dismissedLeftDrawerTool, setDismissedLeftDrawerTool };
}

function useFloatingRailProps(
  toolbarProps: ReturnType<typeof useEditorToolbarController>,
  setDismissedLeftDrawerTool: (tool: EditorTool | null) => void
) {
  return useMemo(
    () => ({
      ...toolbarProps,
      onActivateTool: (tool: EditorTool) => {
        setDismissedLeftDrawerTool(null);
        toolbarProps.onActivateTool(tool);
      },
    }),
    [setDismissedLeftDrawerTool, toolbarProps]
  );
}

type FloatingLoadedSurfacesProps = {
  documentController: ReturnType<typeof useEditorInspectorSidebarController>;
  hasImage: boolean;
  layersCollapsed: boolean;
  layersHeightRatio: number | null;
  layersPreferenceError: string | null;
  onCollapseLayers: () => void;
  onExpandLayers: () => void;
  onLayersHeightRatioChange: (heightRatio: number | null) => void;
  setDismissedLeftDrawerTool: (tool: EditorTool | null) => void;
  surfaceRoute: ReturnType<typeof resolveFloatingSurfaceRoute>;
  toolbarProps: ReturnType<typeof useEditorToolbarController>;
};

function EditorFloatingLoadedSurfaces({
  documentController,
  hasImage,
  layersCollapsed,
  layersHeightRatio,
  layersPreferenceError,
  onCollapseLayers,
  onExpandLayers,
  onLayersHeightRatioChange,
  setDismissedLeftDrawerTool,
  surfaceRoute,
  toolbarProps,
}: FloatingLoadedSurfacesProps) {
  return (
    <>
      <EditorFloatingViewControls {...toolbarProps} documentController={documentController} />
      <EditorFloatingRoutedPanels
        documentController={documentController}
        hasImage={hasImage}
        setDismissedLeftDrawerTool={setDismissedLeftDrawerTool}
        surfaceRoute={surfaceRoute}
        toolbarProps={toolbarProps}
      />
      <EditorFloatingDockedPanels
        documentController={documentController}
        hasImage={hasImage}
        inspectorMeta={toolbarProps.inspectorMeta}
        layersCollapsed={layersCollapsed}
        layersHeightRatio={layersHeightRatio}
        layersPreferenceError={layersPreferenceError}
        onCollapseLayers={onCollapseLayers}
        onExpandLayers={onExpandLayers}
        onLayersHeightRatioChange={onLayersHeightRatioChange}
      />
      <EditorFloatingSelectionSurfaces
        documentController={documentController}
        hasImage={hasImage}
        surfaceRoute={surfaceRoute}
        toolbarProps={toolbarProps}
      />
    </>
  );
}

function EditorFloatingDockedPanels({
  documentController,
  hasImage,
  inspectorMeta,
  layersCollapsed,
  layersHeightRatio,
  layersPreferenceError,
  onCollapseLayers,
  onExpandLayers,
  onLayersHeightRatioChange,
}: Pick<
  Parameters<typeof EditorFloatingLoadedSurfaces>[0],
  | 'documentController'
  | 'hasImage'
  | 'layersCollapsed'
  | 'layersHeightRatio'
  | 'layersPreferenceError'
  | 'onCollapseLayers'
  | 'onExpandLayers'
  | 'onLayersHeightRatioChange'
> & {
  inspectorMeta: ReturnType<typeof useEditorToolbarController>['inspectorMeta'];
}) {
  return (
    <EditorFloatingRightStack
      hasImage={hasImage}
      inspectorMeta={inspectorMeta}
      layersCollapsed={layersCollapsed}
      layersHeightRatio={layersHeightRatio}
      layersPreferenceError={layersPreferenceError}
      documentController={documentController}
      onCollapseLayers={onCollapseLayers}
      onExpandLayers={onExpandLayers}
      onLayersHeightRatioChange={onLayersHeightRatioChange}
    />
  );
}

function EditorFloatingSelectionSurfaces({
  documentController,
  hasImage,
  surfaceRoute,
  toolbarProps,
}: Pick<
  Parameters<typeof EditorFloatingLoadedSurfaces>[0],
  'documentController' | 'hasImage' | 'surfaceRoute' | 'toolbarProps'
>) {
  return (
    <>
      <EditorFloatingToolPropertiesRail
        activeTool={toolbarProps.activeTool}
        documentController={documentController}
        hasImage={hasImage}
        leftDrawerOpen={surfaceRoute.leftDrawer !== null}
        selection={documentController.selection}
      />
      <EditorCanvasSelectionToolbar
        documentController={documentController}
        enabled={surfaceRoute.canvasSelectionToolbar}
        selection={documentController.selection}
      />
    </>
  );
}

function EditorFloatingRoutedPanels({
  documentController,
  hasImage,
  setDismissedLeftDrawerTool,
  surfaceRoute,
  toolbarProps,
}: Pick<
  Parameters<typeof EditorFloatingLoadedSurfaces>[0],
  'documentController' | 'hasImage' | 'setDismissedLeftDrawerTool' | 'surfaceRoute' | 'toolbarProps'
>) {
  return (
    <>
      {surfaceRoute.leftDrawer ? (
        <EditorFloatingLeftDrawer
          documentController={documentController}
          hasImage={hasImage}
          mode={surfaceRoute.leftDrawer}
          onClose={() => {
            setDismissedLeftDrawerTool(surfaceRoute.leftDrawer);
            documentController.setInspector('tool');
          }}
        />
      ) : null}
      {surfaceRoute.rightUtility && surfaceRoute.rightUtility !== 'layer-effects' ? (
        <EditorFloatingUtilityPanel
          documentController={documentController}
          hasImage={hasImage}
          inspectorMeta={toolbarProps.inspectorMeta}
          mode={surfaceRoute.rightUtility}
        />
      ) : null}
    </>
  );
}

export function EditorFloatingWorkspace({ hasImage }: { hasImage: boolean }) {
  const toolbarProps = useEditorToolbarController(hasImage);
  const edgeInsets = useFloatingWorkspaceEdgeInsets(hasImage);
  const {
    layersCollapsed,
    layersHeightRatio,
    layersPreferenceError,
    setLayersCollapsed,
    setLayersHeightRatio,
  } = useFloatingLayersPreferenceState();
  const documentController = useEditorInspectorSidebarController(hasImage);
  const { dismissedLeftDrawerTool, setDismissedLeftDrawerTool } = useDismissedLeftDrawer(
    toolbarProps.activeTool
  );
  const surfaceRoute = resolveFloatingSurfaceRoute({
    activeTool: toolbarProps.activeTool,
    dismissedLeftDrawerTool,
    hasImage,
    inspector: documentController.inspector,
    selection: documentController.selection,
  });
  const railProps = useFloatingRailProps(toolbarProps, setDismissedLeftDrawerTool);

  return (
    <FloatingChromeRoot
      dataUi="editor.floating-workspace"
      style={getFloatingWorkspaceEdgeInsetStyle(edgeInsets)}
    >
      <EditorFloatingDocumentBar {...toolbarProps} documentController={documentController} />
      <EditorFloatingToolRail {...railProps} leftDrawerOpen={surfaceRoute.leftDrawer !== null} />
      <EditorFloatingWorkspaceOverlays documentController={documentController} />
      {hasImage ? (
        <EditorFloatingLoadedSurfaces
          documentController={documentController}
          hasImage={hasImage}
          layersCollapsed={layersCollapsed}
          layersHeightRatio={layersHeightRatio}
          layersPreferenceError={layersPreferenceError}
          onCollapseLayers={() => setLayersCollapsed(true)}
          onExpandLayers={() => setLayersCollapsed(false)}
          onLayersHeightRatioChange={setLayersHeightRatio}
          setDismissedLeftDrawerTool={setDismissedLeftDrawerTool}
          surfaceRoute={surfaceRoute}
          toolbarProps={toolbarProps}
        />
      ) : null}
    </FloatingChromeRoot>
  );
}
