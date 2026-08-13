import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { type CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { useEditorController } from '../../application/controller-context';
import { EditorDrawingOptions } from '../../drawing/options';
import { createToolPropertiesGroups } from './tool-properties-groups';
import type { EditorFloatingDocumentController } from './document-bar';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { ToolPropertiesButton } from './tool-properties-button';

const TOOL_PROPERTIES_CLASS_NAME = floatingChromeClassNames(
  ['absolute left-1/2 top-[4.5rem] z-40 flex -translate-x-1/2', 'max-h-[calc(100vh-8.5rem)]'].join(
    ' '
  ),
  'flex-col overflow-visible',
  'max-[720px]:bottom-[4.75rem] max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-auto',
  'max-[720px]:max-h-none max-[720px]:translate-x-0 max-[720px]:flex-row'
);

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
      <FloatingChromeToolbar
        dataUi="editor.floating.tool-properties"
        className={TOOL_PROPERTIES_CLASS_NAME}
      >
        {drawingOptionsTool ? (
          <EditorDrawingOptions
            onApplyToSelection={() => controller.applyActiveSettingsToSelection()}
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
    </div>
  );
}
