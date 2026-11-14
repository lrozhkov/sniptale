import { useToolPropertiesSelection } from './tool-properties-selection';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { resolveToolbarSurfacePlacement } from '@sniptale/ui/floating-interactions/placement';
import type { EditorTool } from '../../../features/editor/document/types';
import { FloatingChromeToolbar } from '@sniptale/ui/floating-chrome';
import { type CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { useEditorController } from '../../application/controller-context';
import { EditorDrawingOptions } from '../../drawing/options';
import {
  DrawingSelectionActions,
  useDrawingSelectionDisclosure,
} from '../../../ui/drawing-tools/selection-actions';
import {
  canDeleteLayerSelection,
  canDuplicateLayerSelection,
  canGroupLayerSelection,
  canMergeLayerSelection,
  canReorderLayerSelection,
  canUngroupLayerSelection,
} from '../../inspector/layers/helpers';
import { createToolPropertiesGroups } from './tool-properties-groups';
import type { EditorFloatingDocumentController } from './document-bar';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { EditorRasterProperties, EditorRasterSelectionActions } from './raster-tools';
import { EditorVectorProperties } from './vector-tools';
import { ToolPropertiesButton } from './tool-properties-button';

const TOOL_PROPERTIES_PAIR_CLASS_NAME = [
  'absolute z-40 flex w-max max-w-[calc(100vw-16px)] items-start gap-2 overflow-auto',
].join(' ');

function useToolRailPlacement(enabled: boolean, activeTool: string, centered: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const toolbar = panel?.ownerDocument.querySelector('[data-ui="editor.floating.tool-rail"]');
    if (!enabled || !panel || !toolbar) return;
    const update = () => {
      const parent = panel.offsetParent?.getBoundingClientRect();
      const anchor = centered
        ? toolbar
        : (toolbar.querySelector(`[data-ui="editor.raster.${activeTool}"]`) ??
          toolbar.querySelector(`[data-ui="editor.floating.tool-rail.${activeTool}"]`) ??
          toolbar);
      const position = resolveToolbarSurfacePlacement({
        anchor: anchor.getBoundingClientRect(),
        toolbar: toolbar.getBoundingClientRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        width: panel.offsetWidth,
        height: panel.offsetHeight,
        placement: 'down',
        align: centered ? 'center' : 'start',
      });
      setStyle({
        ...position,
        left:
          Math.round(position.left * window.devicePixelRatio) / window.devicePixelRatio -
          (parent?.left ?? 0),
        top:
          Math.round(position.top * window.devicePixelRatio) / window.devicePixelRatio -
          (parent?.top ?? 0),
      });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(toolbar);
    observer?.observe(panel);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [enabled, activeTool, centered]);

  return { panelRef, style };
}

const TOOL_PROPERTIES_EXCLUDED_ACTIONS = new Set(['meta-technical-data']);

function flattenCommands(commandGroups: CompactCommand[][]): CompactCommand[] {
  return commandGroups
    .flat()
    .filter((command) => !TOOL_PROPERTIES_EXCLUDED_ACTIONS.has(command.id));
}

function useDismissToolProperties(close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const node = target instanceof Node ? target : null;
      const element = target instanceof Element ? target : (node?.parentElement ?? null);

      if (element?.closest('[data-floating-ui-root="true"]')) {
        return;
      }

      if (!node || !rootRef.current?.contains(node)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [close]);

  return rootRef;
}

function useToolPropertyGroups(commandGroups: CompactCommand[][]) {
  const commands = useMemo(() => flattenCommands(commandGroups), [commandGroups]);

  return useMemo(() => createToolPropertiesGroups(commands), [commands]);
}

function ToolPropertiesButtons(props: {
  activeGroupId: string | null;
  groups: FloatingToolbarGroup[];
  onToggle: (groupId: string) => void;
}) {
  return (
    <>
      {props.groups.map((group) => (
        <ToolPropertiesButton
          key={group.id}
          active={props.activeGroupId === group.id}
          group={group}
          onToggle={props.onToggle}
        />
      ))}
    </>
  );
}

interface EditorFloatingToolPropertiesRailProps {
  activeTool: EditorTool;
  collapsedDrawingOptionsTool: EditorTool | null;
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
  leftDrawerOpen: boolean;
  selection: EditorToolbarSelectionState;
}

function ToolSelectionActions({
  layers,
  disclosure,
}: {
  layers: ReturnType<typeof useToolPropertiesSelection>['layers'];
  disclosure: ReturnType<typeof useDrawingSelectionDisclosure>;
}) {
  const controller = useEditorController();
  const selectedLayerCount = layers.filter((layer) => layer.selected).length;
  const canUngroup = canUngroupLayerSelection(layers);
  return (
    <FloatingChromeToolbar dataUi="editor.floating.selection-actions" className="shrink-0">
      <DrawingSelectionActions
        disclosure={disclosure}
        canReorder={canReorderLayerSelection(layers)}
        canDuplicate={canDuplicateLayerSelection(layers)}
        canDelete={canDeleteLayerSelection(layers)}
        {...(selectedLayerCount > 1 || canUngroup
          ? {
              layerCombination: {
                canGroup: canGroupLayerSelection(layers),
                canMerge: canMergeLayerSelection(layers),
                canUngroup,
                showMerge: selectedLayerCount > 1,
                onGroup: () => controller.groupSelectedLayers(),
                onMerge: () => void controller.mergeSelectedLayers(),
                onUngroup: () => controller.ungroupSelectedLayers(),
              },
            }
          : {})}
        onMove={(direction) => {
          if (direction === 'front') controller.bringSelectionToFront();
          else if (direction === 'forward') controller.bringForwardSelection();
          else if (direction === 'backward') controller.sendBackwardSelection();
          else controller.sendSelectionToBack();
        }}
        onDuplicate={() => void controller.duplicateSelection()}
        onDelete={() => controller.deleteSelection()}
        onDeselect={() => controller.clearSelection()}
      />
    </FloatingChromeToolbar>
  );
}

export function EditorFloatingToolPropertiesRail({
  activeTool,
  collapsedDrawingOptionsTool,
  documentController,
  hasImage,
  selection,
}: EditorFloatingToolPropertiesRailProps) {
  const selectionDisclosure = useDrawingSelectionDisclosure(selection.hasSelection);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const groups = useToolPropertyGroups(documentController.compactCommandGroups);
  const {
    controller,
    layers,
    standardPropertiesEnabled,
    drawingPropertiesEnabled,
    drawingOptionsTool,
    selectedDrawingTool,
    rasterRuntime,
    rasterSnapshot,
    rasterEnabled,
    rasterActionsEnabled,
    vectorEnabled,
    enabled,
    showSelectionActions,
  } = useToolPropertiesSelection({
    activeTool,
    collapsedDrawingOptionsTool,
    hasImage,
    selection,
    inspector: documentController.inspector,
    groups,
  });
  const placement = useToolRailPlacement(
    enabled,
    rasterSnapshot?.editing && rasterSnapshot.tool
      ? rasterSnapshot.tool === 'remove-color'
        ? 'removeColor'
        : rasterSnapshot.tool
      : activeTool,
    (rasterEnabled && !rasterSnapshot?.editing) || vectorEnabled
  );
  const rootRef = useDismissToolProperties(() => setActiveGroupId(null));

  useEffect(() => {
    if (!enabled) {
      setActiveGroupId(null);
    }
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div ref={rootRef} className="contents">
      <div
        ref={placement.panelRef}
        className={[TOOL_PROPERTIES_PAIR_CLASS_NAME, vectorEnabled ? '!overflow-visible' : ''].join(
          ' '
        )}
        style={placement.style}
      >
        {vectorEnabled ? (
          <FloatingChromeToolbar
            dataUi="editor.floating.vector-tools"
            className="min-w-0 max-w-full"
          >
            <EditorVectorProperties />
          </FloatingChromeToolbar>
        ) : null}
        {rasterEnabled && rasterRuntime ? (
          <FloatingChromeToolbar
            dataUi="editor.floating.raster-tools"
            className="min-w-0 max-w-full"
          >
            <EditorRasterProperties runtime={rasterRuntime} />
          </FloatingChromeToolbar>
        ) : null}
        {rasterActionsEnabled && rasterRuntime ? (
          <FloatingChromeToolbar
            dataUi="editor.floating.raster-selection-actions"
            className="shrink-0"
          >
            <EditorRasterSelectionActions runtime={rasterRuntime} />
          </FloatingChromeToolbar>
        ) : null}
        {(standardPropertiesEnabled || drawingPropertiesEnabled) &&
        drawingOptionsTool !== 'selection' ? (
          <FloatingChromeToolbar
            dataUi="editor.floating.tool-properties"
            className={`min-w-0 max-w-full overflow-x-auto ${drawingOptionsTool ? 'overflow-y-hidden' : ''}`}
          >
            {drawingOptionsTool ? (
              <EditorDrawingOptions
                {...(selectedDrawingTool === 'simplify'
                  ? { onRebuild: () => controller.applyActiveSettingsToSelection() }
                  : {})}
                onDirectionChange={() => controller.applyToolMode()}
                onApplyToSelection={() => controller.applyActiveSettingsToSelection()}
                onPreviewSelection={() => controller.previewActiveSettingsOnSelection()}
                onClearSelection={() => controller.clearSelection()}
                onDeleteSelection={() => controller.deleteSelection()}
                selectedType={selection.selectedObjectType}
                tool={drawingOptionsTool}
              />
            ) : (
              <ToolPropertiesButtons
                activeGroupId={activeGroupId}
                groups={groups}
                onToggle={(groupId) =>
                  setActiveGroupId((current) => (current === groupId ? null : groupId))
                }
              />
            )}
          </FloatingChromeToolbar>
        ) : null}
        {showSelectionActions ? (
          <ToolSelectionActions layers={layers} disclosure={selectionDisclosure} />
        ) : null}
      </div>
    </div>
  );
}
