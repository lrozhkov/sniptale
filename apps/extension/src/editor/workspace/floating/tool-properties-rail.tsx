import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { type CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { useEditorController } from '../../application/controller-context';
import type { EditorControllerInstance } from '../../controller/instance/types';
import { EditorDrawingOptions } from '../../drawing/options';
import { resolveToolPropertiesStyle } from './tool-properties-geometry';
import { createToolPropertiesGroups } from './tool-properties-groups';
import type { EditorFloatingDocumentController } from './document-bar';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { ToolPropertiesButton } from './tool-properties-button';
import { FrameAnnotationCreationControls } from '../../../composition/frame-annotation-controls/creation-controls';
import {
  initializeFrameAnnotationCreationDefaults,
  setFrameAnnotationCreationDefaults,
  useFrameAnnotationCreationDefaults,
} from '../../frame-annotation/creation-defaults';
import { loadHighlighterSettings } from '../../../composition/persistence/highlighter';

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
  'pencil',
  'marker',
  'shape',
  'arrow',
  'text',
  'step',
  'frame-annotation',
]);

const TOOL_PROPERTIES_EXCLUDED_ACTIONS = new Set(['meta-technical-data']);

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
  const controller = useEditorController();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const frameAnnotationDefaults = useFrameAnnotationCreationDefaults();
  useEffect(() => {
    if (activeTool === 'frame-annotation') {
      void initializeFrameAnnotationCreationDefaults(loadHighlighterSettings);
    }
  }, [activeTool]);
  const groups = useToolPropertyGroups(documentController.compactCommandGroups);
  const standardPropertiesEnabled = isToolPropertiesEnabled({
    activeTool,
    groups,
    hasImage,
    inspector: documentController.inspector,
    selection,
  });
  const frameAnnotationPropertiesEnabled =
    hasImage &&
    documentController.inspector === 'tool' &&
    !selection.hasSelection &&
    activeTool === 'frame-annotation';
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
  const drawingOptionsTool = selectedDrawingTool ?? activeDrawingTool;
  const drawingPropertiesEnabled = hasImage && Boolean(drawingOptionsTool);
  const enabled =
    standardPropertiesEnabled || frameAnnotationPropertiesEnabled || drawingPropertiesEnabled;
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
        {drawingOptionsTool ? (
          <EditorDrawingOptions
            onApplyToSelection={() => controller.applyActiveSettingsToSelection()}
            onClearSelection={() => controller.clearSelection()}
            onDeleteSelection={() => controller.deleteSelection()}
            selectedType={selection.selectedObjectType}
            tool={drawingOptionsTool}
          />
        ) : frameAnnotationPropertiesEnabled ? (
          <FrameAnnotationCreationControls
            dataUi="editor.frame-annotation.creation-controls"
            onChange={setFrameAnnotationCreationDefaults}
            settings={frameAnnotationDefaults}
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
