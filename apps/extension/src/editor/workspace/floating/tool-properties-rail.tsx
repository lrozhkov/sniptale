import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { FloatingChromeToolbar } from '@sniptale/ui/floating-chrome';
import { type CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { useEditorController } from '../../application/controller-context';
import { EditorDrawingOptions } from '../../drawing/options';
import { DrawingSelectionActions } from '../../../ui/drawing-tools/selection-actions';
import { useEditorStore } from '../../state/useEditorStore';
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
import { ToolPropertiesButton } from './tool-properties-button';

const TOOL_PROPERTIES_PAIR_CLASS_NAME = [
  'absolute left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-start gap-2',
  'max-[720px]:left-3 max-[720px]:right-3 max-[720px]:translate-x-0',
].join(' ');

function useToolRailPlacement(enabled: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number>();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const toolbar = panel?.ownerDocument.querySelector('[data-ui="editor.floating.tool-rail"]');
    if (!enabled || !panel || !toolbar) return;
    const update = () => {
      const parentTop = panel.offsetParent?.getBoundingClientRect().top ?? 0;
      setTop(toolbar.getBoundingClientRect().bottom - parentTop + 6);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(toolbar);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return { panelRef, top };
}

const TOOLS_WITH_PROPERTIES = new Set<EditorTool>(['step']);

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

function isToolPropertiesEnabled(args: {
  activeTool: EditorTool;
  groups: FloatingToolbarGroup[];
  hasImage: boolean;
  inspector: EditorFloatingDocumentController['inspector'];
  selection: EditorToolbarSelectionState;
}) {
  return (
    args.hasImage &&
    args.inspector === 'tool' &&
    (!args.selection.hasSelection || args.activeTool === 'select') &&
    TOOLS_WITH_PROPERTIES.has(args.activeTool) &&
    args.groups.length > 0
  );
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

export function EditorFloatingToolPropertiesRail({
  activeTool,
  collapsedDrawingOptionsTool,
  documentController,
  hasImage,
  selection,
}: EditorFloatingToolPropertiesRailProps) {
  const controller = useEditorController();
  const layers = useEditorStore((state) => state.layers);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const groups = useToolPropertyGroups(documentController.compactCommandGroups);
  const standardPropertiesEnabled = isToolPropertiesEnabled({
    activeTool,
    groups,
    hasImage,
    inspector: documentController.inspector,
    selection,
  });
  const selectedDrawingTool =
    selection.selectedObjectType === 'pencil' ||
    selection.selectedObjectType === 'marker' ||
    selection.selectedObjectType === 'shape' ||
    selection.selectedObjectType === 'arrow' ||
    selection.selectedObjectType === 'blur' ||
    selection.selectedObjectType === 'text'
      ? selection.selectedObjectType
      : null;
  const activeDrawingTool =
    activeTool === 'pencil' ||
    activeTool === 'marker' ||
    activeTool === 'shape' ||
    activeTool === 'arrow' ||
    activeTool === 'blur' ||
    activeTool === 'text'
      ? activeTool
      : null;
  const drawingOptionsTool =
    selectedDrawingTool ??
    (selection.selectedObjectsAreDrawing && selection.hasSelection ? 'selection' : null) ??
    activeDrawingTool;
  const matchingActiveDrawingOptionsCollapsed =
    collapsedDrawingOptionsTool === activeDrawingTool && drawingOptionsTool === activeDrawingTool;
  const drawingPropertiesEnabled =
    hasImage &&
    Boolean(drawingOptionsTool) &&
    !matchingActiveDrawingOptionsCollapsed &&
    Boolean(
      selectedDrawingTool ||
      selection.selectedObjectsAreDrawing ||
      collapsedDrawingOptionsTool !== activeDrawingTool
    );
  const enabled = standardPropertiesEnabled || drawingPropertiesEnabled;
  const showSelectionActions = drawingPropertiesEnabled && selection.hasSelection;
  const selectedLayerCount = layers.filter((layer) => layer.selected).length;
  const canUngroup = canUngroupLayerSelection(layers);
  const placement = useToolRailPlacement(enabled);
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
        className={TOOL_PROPERTIES_PAIR_CLASS_NAME}
        style={{
          top: placement.top,
          maxHeight:
            placement.top === undefined ? undefined : `calc(100% - ${placement.top}px - 12px)`,
        }}
      >
        <FloatingChromeToolbar
          dataUi="editor.floating.tool-properties"
          className={`min-w-0 max-w-full overflow-x-auto ${drawingOptionsTool ? 'overflow-y-hidden' : ''}`}
        >
          {drawingOptionsTool ? (
            <EditorDrawingOptions
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
        {showSelectionActions ? (
          <FloatingChromeToolbar dataUi="editor.floating.selection-actions" className="shrink-0">
            <DrawingSelectionActions
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
        ) : null}
      </div>
    </div>
  );
}
