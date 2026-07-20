import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import type { FabricObject } from 'fabric';
import type { useEditorController } from '../../application/controller-context';
import {
  resolveCanvasContextMenuRequest,
  resolveCanvasContextMenuState,
} from './context-menu/helpers';
import type { CanvasContextMenuState } from './context-menu/types';
import type { useCanvasWrapperState } from './use-state';

type CanvasContextMenuSource = 'dom' | 'fabric';
type CanvasContextMenuTriggerPolicy = 'block' | 'delegate' | 'open';

function isSurfaceContextTarget(args: {
  hasImage: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  target: EventTarget | null;
}) {
  return (
    !args.hasImage ||
    (args.target instanceof Node && Boolean(args.surfaceRef.current?.contains(args.target)))
  );
}

function resolveCanvasContextMenuTriggerPolicy(args: {
  hasImage: boolean;
  source: CanvasContextMenuSource;
  surfaceRef: RefObject<HTMLDivElement | null>;
  target: EventTarget | null;
}): CanvasContextMenuTriggerPolicy {
  if (!args.hasImage) {
    return 'open';
  }

  if (args.source === 'fabric') {
    return 'open';
  }

  return isSurfaceContextTarget({
    hasImage: args.hasImage,
    surfaceRef: args.surfaceRef,
    target: args.target,
  })
    ? 'delegate'
    : 'block';
}

function resolveContextMenuAnchor(
  event: Pick<globalThis.MouseEvent, 'clientX' | 'clientY'>,
  wrapperRef: RefObject<HTMLDivElement | null>
) {
  const wrapperRect = wrapperRef.current?.getBoundingClientRect();

  return {
    x: event.clientX - (wrapperRect?.left ?? 0),
    y: event.clientY - (wrapperRect?.top ?? 0),
  };
}

function buildContextMenuState(args: {
  controller: ReturnType<typeof useEditorController>;
  event: globalThis.MouseEvent;
  hasImage: boolean;
  layers: ReturnType<typeof useCanvasWrapperState>['layers'];
  selection: ReturnType<typeof useCanvasWrapperState>['selection'];
  wrapperRef: RefObject<HTMLDivElement | null>;
}): CanvasContextMenuState | null {
  const request = resolveCanvasContextMenuRequest({
    controller: args.controller,
    event: args.event,
    hasImage: args.hasImage,
    layers: args.layers,
    selection: args.selection,
  });
  if (!request) {
    return null;
  }

  const anchor = resolveContextMenuAnchor(args.event, args.wrapperRef);
  return {
    anchor,
    ...resolveCanvasContextMenuState({
      anchor,
      request,
      wrapperElement: args.wrapperRef.current,
    }),
  };
}

type CanvasContextMenuSubscriptionEvent = {
  e: globalThis.MouseEvent;
  target?: FabricObject | null;
};

type CanvasContextMenuSubscribable = {
  off: (
    eventName: 'contextmenu',
    listener: (event: CanvasContextMenuSubscriptionEvent) => void
  ) => void;
  on: (
    eventName: 'contextmenu',
    listener: (event: CanvasContextMenuSubscriptionEvent) => void
  ) => void;
};

type CanvasContextMenuSubscriptionSource = {
  off?: CanvasContextMenuSubscribable['off'];
  on?: CanvasContextMenuSubscribable['on'];
};

function resolveCanvasContextMenuSubscribable(
  controller: ReturnType<typeof useEditorController>
): CanvasContextMenuSubscribable | null {
  const canvas = controller.canvas as unknown;
  if (!canvas || typeof canvas !== 'object') {
    return null;
  }
  const subscribableCanvas = canvas as CanvasContextMenuSubscriptionSource;
  if (typeof subscribableCanvas.on !== 'function' || typeof subscribableCanvas.off !== 'function') {
    return null;
  }
  const on = subscribableCanvas.on;
  const off = subscribableCanvas.off;

  return {
    off: off.bind(canvas) as CanvasContextMenuSubscribable['off'],
    on: on.bind(canvas) as CanvasContextMenuSubscribable['on'],
  };
}

function createOpenContextMenu(args: {
  controller: ReturnType<typeof useEditorController>;
  hasImage: boolean;
  layers: ReturnType<typeof useCanvasWrapperState>['layers'];
  selection: ReturnType<typeof useCanvasWrapperState>['selection'];
  setContextMenuState: Dispatch<SetStateAction<CanvasContextMenuState | null>>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}) {
  return (event: globalThis.MouseEvent) => {
    const nextState = buildContextMenuState({
      controller: args.controller,
      event,
      hasImage: args.hasImage,
      layers: args.layers,
      selection: args.selection,
      wrapperRef: args.wrapperRef,
    });
    args.setContextMenuState(nextState);
    if (nextState) {
      event.preventDefault();
    }
  };
}

function useCanvasContextMenuSubscription(args: {
  controller: ReturnType<typeof useEditorController>;
  hasImage: boolean;
  closeContextMenu: () => void;
  openContextMenu: (event: globalThis.MouseEvent) => void;
  surfaceRef: RefObject<HTMLDivElement | null>;
}) {
  const { controller, hasImage, openContextMenu, closeContextMenu, surfaceRef } = args;

  useEffect(() => {
    if (!hasImage) {
      return;
    }
    const canvas = resolveCanvasContextMenuSubscribable(controller);
    if (!canvas) {
      return;
    }

    const handleCanvasContextMenu = (event: CanvasContextMenuSubscriptionEvent) => {
      const policy = resolveCanvasContextMenuTriggerPolicy({
        hasImage,
        source: 'fabric',
        surfaceRef,
        target: event.e.target,
      });
      if (policy === 'block') {
        event.e.preventDefault();
        closeContextMenu();
        return;
      }

      openContextMenu(event.e);
    };

    canvas.on('contextmenu', handleCanvasContextMenu);
    return () => canvas.off('contextmenu', handleCanvasContextMenu);
  }, [closeContextMenu, controller, hasImage, openContextMenu, surfaceRef]);
}

function createHandleCanvasContextMenu(args: {
  closeContextMenu: () => void;
  hasImage: boolean;
  openContextMenu: (event: globalThis.MouseEvent) => void;
  surfaceRef: RefObject<HTMLDivElement | null>;
}) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    const policy = resolveCanvasContextMenuTriggerPolicy({
      hasImage: args.hasImage,
      source: 'dom',
      surfaceRef: args.surfaceRef,
      target: event.target,
    });
    switch (policy) {
      case 'block':
        event.preventDefault();
        args.closeContextMenu();
        return;
      case 'delegate':
        return;
      case 'open':
        args.openContextMenu(event.nativeEvent);
        return;
    }
  };
}

export function useCanvasContextMenuOwner(props: {
  controller: ReturnType<typeof useEditorController>;
  hasImage: boolean;
  layers: ReturnType<typeof useCanvasWrapperState>['layers'];
  selection: ReturnType<typeof useCanvasWrapperState>['selection'];
  surfaceRef: RefObject<HTMLDivElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}) {
  const [contextMenuState, setContextMenuState] = useState<CanvasContextMenuState | null>(null);

  const closeContextMenu = () => {
    setContextMenuState(null);
  };
  const openContextMenu = createOpenContextMenu({
    controller: props.controller,
    hasImage: props.hasImage,
    layers: props.layers,
    selection: props.selection,
    setContextMenuState,
    wrapperRef: props.wrapperRef,
  });
  useCanvasContextMenuSubscription({
    closeContextMenu,
    controller: props.controller,
    hasImage: props.hasImage,
    openContextMenu,
    surfaceRef: props.surfaceRef,
  });

  const handleCanvasContextMenu = createHandleCanvasContextMenu({
    closeContextMenu,
    hasImage: props.hasImage,
    openContextMenu,
    surfaceRef: props.surfaceRef,
  });

  return {
    closeContextMenu,
    contextMenuState,
    handleCanvasContextMenu,
  };
}
