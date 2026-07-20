import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { type CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { useEditorController } from '../../application/controller-context';
import type { EditorControllerInstance } from '../../controller/instance/types';
import { RASTER_TOOL_ORDER, TOOL_ORDER } from '../../chrome/tool-icons';
import { createToolPropertiesGroups } from './tool-properties-groups';
import type { EditorFloatingDocumentController } from './document-bar';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { ToolPropertiesButton } from './tool-properties-button';

const TOOL_PROPERTIES_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute left-[4.75rem] top-[var(--editor-tool-properties-top)] z-40 flex',
    'max-h-[calc(100vh-8.5rem)] -translate-y-1/2',
  ].join(' '),
  'flex-col overflow-visible',
  'max-[720px]:bottom-[4.75rem] max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-auto',
  'max-[720px]:max-h-none max-[720px]:translate-y-0 max-[720px]:flex-row'
);

const TOOL_PROPERTIES_SHIFTED_CLASS_NAME = floatingChromeClassNames(
  TOOL_PROPERTIES_CLASS_NAME,
  'min-[721px]:left-[25.25rem]'
);

const TOOLS_WITH_PROPERTIES = new Set<EditorTool>([
  ...RASTER_TOOL_ORDER,
  'pencil',
  'highlighter',
  'rectangle',
  'ellipse',
  'diamond',
  'blur',
  'arrow',
  'line',
  'text',
  'step',
]);

const TOOL_RAIL_BUTTON_SIZE_PX = 36;
const TOOL_RAIL_ITEM_GAP_PX = 6;
const TOOL_RAIL_CHILD_GAP_PX = 6;
const TOOL_RAIL_DIVIDER_SIZE_PX = 1;
const TOOL_RAIL_PADDING_PX = 6;

const TOOL_RAIL_PRIMARY_TOOLS = TOOL_ORDER;
const TOOL_RAIL_RASTER_TOOLS: EditorTool[] = [...RASTER_TOOL_ORDER, 'crop'];
const TOOL_PROPERTIES_EXCLUDED_ACTIONS = new Set(['meta-technical-data']);

function getToolRailGroupHeight(toolCount: number) {
  return toolCount * TOOL_RAIL_BUTTON_SIZE_PX + Math.max(0, toolCount - 1) * TOOL_RAIL_ITEM_GAP_PX;
}

const TOOL_RAIL_PRIMARY_HEIGHT_PX = getToolRailGroupHeight(TOOL_RAIL_PRIMARY_TOOLS.length);
const TOOL_RAIL_RASTER_HEIGHT_PX = getToolRailGroupHeight(TOOL_RAIL_RASTER_TOOLS.length);
const TOOL_RAIL_INSPECTOR_HEIGHT_PX = getToolRailGroupHeight(4);
const TOOL_RAIL_HEIGHT_ESTIMATE_PX =
  TOOL_RAIL_PADDING_PX * 2 +
  TOOL_RAIL_PRIMARY_HEIGHT_PX +
  TOOL_RAIL_RASTER_HEIGHT_PX +
  TOOL_RAIL_INSPECTOR_HEIGHT_PX +
  TOOL_RAIL_DIVIDER_SIZE_PX * 2 +
  TOOL_RAIL_CHILD_GAP_PX * 4;

function resolveToolPropertiesAnchorOffset(activeTool: EditorTool) {
  const primaryIndex = TOOL_RAIL_PRIMARY_TOOLS.indexOf(activeTool);
  if (primaryIndex >= 0) {
    return (
      TOOL_RAIL_PADDING_PX +
      primaryIndex * (TOOL_RAIL_BUTTON_SIZE_PX + TOOL_RAIL_ITEM_GAP_PX) +
      TOOL_RAIL_BUTTON_SIZE_PX / 2
    );
  }

  const rasterIndex = TOOL_RAIL_RASTER_TOOLS.indexOf(activeTool);
  if (rasterIndex >= 0) {
    const rasterStart =
      TOOL_RAIL_PADDING_PX +
      TOOL_RAIL_PRIMARY_HEIGHT_PX +
      TOOL_RAIL_CHILD_GAP_PX +
      TOOL_RAIL_DIVIDER_SIZE_PX +
      TOOL_RAIL_CHILD_GAP_PX;

    return (
      rasterStart +
      rasterIndex * (TOOL_RAIL_BUTTON_SIZE_PX + TOOL_RAIL_ITEM_GAP_PX) +
      TOOL_RAIL_BUTTON_SIZE_PX / 2
    );
  }

  return TOOL_RAIL_HEIGHT_ESTIMATE_PX / 2;
}

function resolveToolPropertiesStyle(activeTool: EditorTool) {
  const anchorOffset = resolveToolPropertiesAnchorOffset(activeTool);

  return {
    '--editor-tool-properties-top': [
      'clamp(5rem,',
      `calc(50vh - ${TOOL_RAIL_HEIGHT_ESTIMATE_PX / 2}px + ${anchorOffset}px),`,
      'calc(100vh - 5rem))',
    ].join(' '),
  } as React.CSSProperties;
}

function flattenCommands(commandGroups: CompactCommand[][]): CompactCommand[] {
  return commandGroups
    .flat()
    .filter((command) => !TOOL_PROPERTIES_EXCLUDED_ACTIONS.has(command.id));
}

function useToolPropertiesVisibility(enabled: boolean) {
  const controller = useEditorController();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    const canvas = controller.canvas as EditorControllerInstance['canvas'];
    let returnTimer = 0;
    const clearReturnTimer = () => {
      if (returnTimer !== 0) {
        window.clearTimeout(returnTimer);
        returnTimer = 0;
      }
    };
    const hide = () => {
      clearReturnTimer();
      setHidden(true);
    };
    const showAfterAction = () => {
      clearReturnTimer();
      returnTimer = window.setTimeout(() => {
        returnTimer = 0;
        setHidden(false);
      }, 250);
    };

    canvas?.on('mouse:down', hide);
    canvas?.on('path:created', showAfterAction);
    canvas?.on('mouse:up', showAfterAction);
    return () => {
      clearReturnTimer();
      canvas?.off('mouse:down', hide);
      canvas?.off('path:created', showAfterAction);
      canvas?.off('mouse:up', showAfterAction);
    };
  }, [controller, enabled]);

  return hidden;
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
    (!args.selection.hasSelection ||
      args.activeTool === 'selection' ||
      args.activeTool === 'brush' ||
      args.activeTool === 'eraser' ||
      args.activeTool === 'fill') &&
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
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
  leftDrawerOpen: boolean;
  selection: EditorToolbarSelectionState;
}

export function EditorFloatingToolPropertiesRail({
  activeTool,
  documentController,
  hasImage,
  leftDrawerOpen,
  selection,
}: EditorFloatingToolPropertiesRailProps) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const groups = useToolPropertyGroups(documentController.compactCommandGroups);
  const enabled = isToolPropertiesEnabled({
    activeTool,
    groups,
    hasImage,
    inspector: documentController.inspector,
    selection,
  });
  const hidden = useToolPropertiesVisibility(enabled);
  const rootRef = useDismissToolProperties(() => setActiveGroupId(null));
  const className = leftDrawerOpen
    ? TOOL_PROPERTIES_SHIFTED_CLASS_NAME
    : TOOL_PROPERTIES_CLASS_NAME;

  useEffect(() => {
    if (!enabled) {
      setActiveGroupId(null);
    }
  }, [enabled]);

  if (!enabled || hidden) {
    return null;
  }

  return (
    <div ref={rootRef} className="contents">
      <FloatingChromeToolbar
        dataUi="editor.floating.tool-properties"
        className={className}
        style={resolveToolPropertiesStyle(activeTool)}
      >
        <ToolPropertiesButtons
          activeGroupId={activeGroupId}
          groups={groups}
          onToggle={(groupId) =>
            setActiveGroupId((current) => (current === groupId ? null : groupId))
          }
        />
      </FloatingChromeToolbar>
    </div>
  );
}
