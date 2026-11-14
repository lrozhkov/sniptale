import { useEffect, useMemo, useState } from 'react';
import { FloatingChromeRoot } from '@sniptale/ui/floating-chrome';
import type { EditorTool } from '../../../features/editor/document/types';
import { useEditorInspectorSidebarController } from '../../inspector/sidebar-controller';
import { useEditorToolbarController } from '../toolbar/use-controller';
import { EditorFloatingDocumentBar, ImageDocumentOperationsProvider } from './document-bar';
import { EditorFloatingLeftDrawer } from './left-drawer';
import { EditorFloatingWorkspaceOverlays } from './overlays';
import { EditorFloatingRightStack } from './right-stack';
import { resolveFloatingSurfaceRoute } from './routes';
import { EditorFloatingToolRail } from './tool-rail';
import { RasterToolPropertiesProvider } from './raster-tools';
import { EditorFloatingToolPropertiesRail } from './tool-properties-rail';
import { EditorFloatingViewControls } from './view-controls';
import { getFloatingWorkspaceEdgeInsetStyle, useFloatingWorkspaceEdgeInsets } from './edge-insets';
import { useFloatingLayersPreferenceState } from './preferences';
import { installEditorToastHostAdapter } from './toast-host';

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
  setDismissedLeftDrawerTool: (tool: EditorTool | null) => void,
  setCollapsedDrawingOptionsTool: React.Dispatch<React.SetStateAction<EditorTool | null>>
) {
  return useMemo(
    () => ({
      ...toolbarProps,
      onActivateTool: (tool: EditorTool) => {
        setDismissedLeftDrawerTool(null);
        setCollapsedDrawingOptionsTool(null);
        toolbarProps.onActivateTool(tool);
      },
      onToggleActiveToolOptions: (tool: EditorTool) =>
        setCollapsedDrawingOptionsTool((current) => (current === tool ? null : tool)),
    }),
    [setCollapsedDrawingOptionsTool, setDismissedLeftDrawerTool, toolbarProps]
  );
}

type FloatingLoadedSurfacesProps = {
  documentController: ReturnType<typeof useEditorInspectorSidebarController>;
  collapsedDrawingOptionsTool: EditorTool | null;
  hasImage: boolean;
  layersCollapsed: boolean;
  layersHeight: number | null;
  layersPreferenceError: string | null;
  onCollapseLayers: () => void;
  onExpandLayers: () => void;
  onLayersHeightChange: (preferredHeight: number | null) => void;
  setDismissedLeftDrawerTool: (tool: EditorTool | null) => void;
  surfaceRoute: ReturnType<typeof resolveFloatingSurfaceRoute>;
  toolbarProps: ReturnType<typeof useEditorToolbarController>;
};

function EditorFloatingLoadedSurfaces({
  documentController,
  collapsedDrawingOptionsTool,
  hasImage,
  layersCollapsed,
  layersHeight,
  layersPreferenceError,
  onCollapseLayers,
  onExpandLayers,
  onLayersHeightChange,
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
      />
      <EditorFloatingDockedPanels
        documentController={documentController}
        hasImage={hasImage}
        inspectorMeta={toolbarProps.inspectorMeta}
        layersCollapsed={layersCollapsed}
        layersHeight={layersHeight}
        layersPreferenceError={layersPreferenceError}
        onCollapseLayers={onCollapseLayers}
        onExpandLayers={onExpandLayers}
        onLayersHeightChange={onLayersHeightChange}
      />
      <EditorFloatingSelectionSurfaces
        collapsedDrawingOptionsTool={collapsedDrawingOptionsTool}
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
  layersHeight,
  layersPreferenceError,
  onCollapseLayers,
  onExpandLayers,
  onLayersHeightChange,
}: Pick<
  Parameters<typeof EditorFloatingLoadedSurfaces>[0],
  | 'documentController'
  | 'hasImage'
  | 'layersCollapsed'
  | 'layersHeight'
  | 'layersPreferenceError'
  | 'onCollapseLayers'
  | 'onExpandLayers'
  | 'onLayersHeightChange'
> & {
  inspectorMeta: ReturnType<typeof useEditorToolbarController>['inspectorMeta'];
}) {
  return (
    <EditorFloatingRightStack
      hasImage={hasImage}
      inspectorMeta={inspectorMeta}
      layersCollapsed={layersCollapsed}
      layersHeight={layersHeight}
      layersPreferenceError={layersPreferenceError}
      documentController={documentController}
      onCollapseLayers={onCollapseLayers}
      onExpandLayers={onExpandLayers}
      onLayersHeightChange={onLayersHeightChange}
    />
  );
}

function EditorFloatingSelectionSurfaces({
  collapsedDrawingOptionsTool,
  documentController,
  hasImage,
  surfaceRoute,
  toolbarProps,
}: Pick<
  Parameters<typeof EditorFloatingLoadedSurfaces>[0],
  | 'collapsedDrawingOptionsTool'
  | 'documentController'
  | 'hasImage'
  | 'surfaceRoute'
  | 'toolbarProps'
>) {
  return (
    <>
      <EditorFloatingToolPropertiesRail
        activeTool={toolbarProps.activeTool}
        collapsedDrawingOptionsTool={collapsedDrawingOptionsTool}
        documentController={documentController}
        hasImage={hasImage}
        leftDrawerOpen={surfaceRoute.leftDrawer !== null}
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
}: Pick<
  Parameters<typeof EditorFloatingLoadedSurfaces>[0],
  'documentController' | 'hasImage' | 'setDismissedLeftDrawerTool' | 'surfaceRoute'
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
    </>
  );
}

export function EditorFloatingWorkspace({ hasImage }: { hasImage: boolean }) {
  useEffect(() => installEditorToastHostAdapter(), []);
  const toolbarProps = useEditorToolbarController(hasImage);
  const edgeInsets = useFloatingWorkspaceEdgeInsets(hasImage);
  const {
    layersCollapsed,
    layersHeight,
    layersPreferenceError,
    setLayersCollapsed,
    setLayersHeight,
  } = useFloatingLayersPreferenceState();
  const documentController = useEditorInspectorSidebarController(hasImage);
  const { dismissedLeftDrawerTool, setDismissedLeftDrawerTool } = useDismissedLeftDrawer(
    toolbarProps.activeTool
  );
  const [collapsedDrawingOptionsTool, setCollapsedDrawingOptionsTool] = useState<EditorTool | null>(
    null
  );
  useEffect(() => {
    if (
      collapsedDrawingOptionsTool !== null &&
      collapsedDrawingOptionsTool !== toolbarProps.activeTool
    ) {
      setCollapsedDrawingOptionsTool(null);
    }
  }, [collapsedDrawingOptionsTool, toolbarProps.activeTool]);
  const surfaceRoute = resolveFloatingSurfaceRoute({
    activeTool: toolbarProps.activeTool,
    dismissedLeftDrawerTool,
    hasImage,
    inspector: documentController.inspector,
    selection: documentController.selection,
  });
  const railProps = useFloatingRailProps(
    toolbarProps,
    setDismissedLeftDrawerTool,
    setCollapsedDrawingOptionsTool
  );

  return (
    <RasterToolPropertiesProvider>
      <FloatingChromeRoot
        dataUi="editor.floating-workspace"
        onWheel={(event) => event.stopPropagation()}
        style={getFloatingWorkspaceEdgeInsetStyle(edgeInsets)}
      >
        {hasImage ? (
          <ImageDocumentOperationsProvider hasImage={hasImage}>
            <EditorFloatingDocumentBar {...toolbarProps} documentController={documentController} />
            <EditorFloatingToolRail
              {...railProps}
              onOpenRasterAdjustments={(targetId) =>
                documentController.onOpenLayerEffects(targetId, 'adjustments', 'brightness')
              }
              leftDrawerOpen={surfaceRoute.leftDrawer !== null}
            />
            <EditorFloatingWorkspaceOverlays documentController={documentController} />
            <EditorFloatingLoadedSurfaces
              collapsedDrawingOptionsTool={collapsedDrawingOptionsTool}
              documentController={documentController}
              hasImage={hasImage}
              layersCollapsed={layersCollapsed}
              layersHeight={layersHeight}
              layersPreferenceError={layersPreferenceError}
              onCollapseLayers={() => setLayersCollapsed(true)}
              onExpandLayers={() => setLayersCollapsed(false)}
              onLayersHeightChange={setLayersHeight}
              setDismissedLeftDrawerTool={setDismissedLeftDrawerTool}
              surfaceRoute={surfaceRoute}
              toolbarProps={toolbarProps}
            />
          </ImageDocumentOperationsProvider>
        ) : null}
      </FloatingChromeRoot>
    </RasterToolPropertiesProvider>
  );
}
