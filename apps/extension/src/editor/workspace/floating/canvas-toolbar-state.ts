import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type React from 'react';
import { useEditorController } from '../../application/controller-context';
import { type CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import {
  buildCanvasSelectionToolbarGroups,
  type FloatingToolbarGroup,
} from './canvas-toolbar-groups';
import {
  CANVAS_POPOVER_HEIGHT_ESTIMATE_PX,
  type CanvasToolbarPopoverPlacement,
  resolveCanvasToolbarPopoverLayout,
  resolveMeasuredPopoverHeight,
} from './canvas-toolbar-popover-layout';
import type { CanvasSelectionToolbarPlacement } from './canvas-toolbar-geometry-types';
import type { EditorFloatingDocumentController } from './document-bar';

export type { CanvasToolbarPopoverPlacement } from './canvas-toolbar-popover-layout';

type CanvasToolbarPopoverLayoutArgs = {
  activeGroupId: string | null;
  buttonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  groups: FloatingToolbarGroup[];
  popoverRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  setPopoverLeft: Dispatch<SetStateAction<number>>;
  setPopoverMaxHeight: Dispatch<SetStateAction<number>>;
  setPopoverPlacement: Dispatch<SetStateAction<CanvasToolbarPopoverPlacement>>;
  toolbarPlacement: CanvasSelectionToolbarPlacement;
};

function flattenCommands(commandGroups: CompactCommand[][]): CompactCommand[] {
  return commandGroups.flat().filter((command) => command.id !== 'meta-technical-data');
}

export function useCanvasToolbarGroups(args: {
  documentController: EditorFloatingDocumentController;
  selection: EditorToolbarSelectionState;
}) {
  const controller = useEditorController();
  const commands = useMemo(
    () => flattenCommands(args.documentController.compactCommandGroups),
    [args.documentController.compactCommandGroups]
  );

  return useMemo(
    () =>
      buildCanvasSelectionToolbarGroups({
        commands,
        documentController: args.documentController,
        handlers: {
          arrangeSelection: args.documentController.arrangeSelection,
          deleteSelection: () => controller.deleteSelection(),
          duplicateSelection: () => controller.duplicateSelection(),
          toggleLayerLock: (layerId) => controller.toggleLayerLock(layerId),
          openLayerEffects: (layerId, category, activeEffectId) => {
            controller.setActiveTool('select');
            args.documentController.syncActiveTool('select');
            args.documentController.openLayerEffects(layerId, category, activeEffectId);
            args.documentController.setLayerEffectsCategory(category);
            args.documentController.setInspector('layer-effects');
          },
        },
        selection: args.selection,
      }),
    [args.documentController, args.selection, commands, controller]
  );
}

function useCanvasToolbarDismiss(
  rootRef: React.RefObject<HTMLDivElement | null>,
  setActiveGroupId: (value: string | null) => void
) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const node = target instanceof Node ? target : null;
      const element = target instanceof Element ? target : (node?.parentElement ?? null);
      if (element?.closest('[data-floating-ui-root="true"]')) {
        return;
      }
      if (!node || !rootRef.current?.contains(node)) {
        setActiveGroupId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveGroupId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [rootRef, setActiveGroupId]);
}

function useCanvasPopoverResizeObserver(args: {
  popoverRef: React.RefObject<HTMLDivElement | null>;
  updatePopoverLayout: () => void;
}) {
  const { popoverRef, updatePopoverLayout } = args;

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => updatePopoverLayout());
    observer.observe(popover);
    window.addEventListener('resize', updatePopoverLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePopoverLayout);
    };
  }, [popoverRef, updatePopoverLayout]);
}

function applyCanvasPopoverLayout(args: CanvasToolbarPopoverLayoutArgs) {
  const button = args.activeGroupId ? args.buttonRefs.current.get(args.activeGroupId) : null;
  const group = args.groups.find((item) => item.id === args.activeGroupId) ?? null;
  if (!button || !args.rootRef.current || !group) {
    args.setPopoverLeft(0);
    return;
  }

  const layout = resolveCanvasToolbarPopoverLayout({
    buttonRect: button.getBoundingClientRect(),
    group,
    measuredHeight: resolveMeasuredPopoverHeight(args.popoverRef.current),
    rootRect: args.rootRef.current.getBoundingClientRect(),
    toolbarPlacement: args.toolbarPlacement,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  });
  args.setPopoverLeft(layout.left);
  args.setPopoverMaxHeight(layout.maxHeight);
  args.setPopoverPlacement(layout.placement);
}

function useCanvasToolbarPopoverLayout(args: CanvasToolbarPopoverLayoutArgs) {
  const {
    activeGroupId,
    buttonRefs,
    groups,
    popoverRef,
    rootRef,
    setPopoverLeft,
    setPopoverMaxHeight,
    setPopoverPlacement,
    toolbarPlacement,
  } = args;
  const updatePopoverLayout = useCallback(() => {
    applyCanvasPopoverLayout({
      activeGroupId,
      buttonRefs,
      groups,
      popoverRef,
      rootRef,
      setPopoverLeft,
      setPopoverMaxHeight,
      setPopoverPlacement,
      toolbarPlacement,
    });
  }, [
    activeGroupId,
    buttonRefs,
    groups,
    popoverRef,
    rootRef,
    setPopoverLeft,
    setPopoverMaxHeight,
    setPopoverPlacement,
    toolbarPlacement,
  ]);

  useLayoutEffect(() => {
    updatePopoverLayout();
  }, [updatePopoverLayout]);

  useCanvasPopoverResizeObserver({ popoverRef, updatePopoverLayout });
}

export function useCanvasToolbarState(
  enabled: boolean,
  groups: FloatingToolbarGroup[],
  toolbarPlacement: CanvasSelectionToolbarPlacement,
  visibilityRevision: number
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [popoverLeft, setPopoverLeft] = useState(0);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState(CANVAS_POPOVER_HEIGHT_ESTIMATE_PX.style);
  const [popoverPlacement, setPopoverPlacement] = useState<CanvasToolbarPopoverPlacement>('below');

  useEffect(() => {
    if (!enabled) {
      setActiveGroupId(null);
    }
  }, [enabled]);

  useEffect(() => {
    setActiveGroupId(null);
  }, [visibilityRevision]);

  useCanvasToolbarPopoverLayout({
    activeGroupId,
    buttonRefs,
    groups,
    popoverRef,
    rootRef,
    setPopoverLeft,
    setPopoverMaxHeight,
    setPopoverPlacement,
    toolbarPlacement,
  });

  useCanvasToolbarDismiss(rootRef, setActiveGroupId);

  return {
    activeGroupId,
    buttonRefs,
    popoverLeft,
    popoverMaxHeight,
    popoverPlacement,
    popoverRef,
    rootRef,
    setActiveGroupId,
  };
}
