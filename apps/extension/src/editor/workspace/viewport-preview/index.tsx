import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppLocale } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import {
  createEditorViewportPreviewKeyHandler,
  createEditorViewportPreviewPointerHandlers,
} from './events';
import { useEditorViewportPreview } from './hook';
import { EditorViewportPreviewContent, EditorViewportPreviewSurface } from './view';

interface EditorViewportPreviewProps {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  forceOpen?: boolean;
  hasImage: boolean;
  maxWidth?: number;
  variant?: 'floating' | 'embedded';
}

const viewportPreviewSurfaceClassName =
  'relative overflow-hidden rounded-[14px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[linear-gradient(45deg,' +
  'color-mix(in_srgb,var(--sniptale-color-text-muted)_22%,transparent)_25%,' +
  'transparent_25%,transparent_75%,' +
  'color-mix(in_srgb,var(--sniptale-color-text-muted)_22%,transparent)_75%,' +
  'color-mix(in_srgb,var(--sniptale-color-text-muted)_22%,transparent)),' +
  'linear-gradient(45deg,' +
  'color-mix(in_srgb,var(--sniptale-color-text-muted)_22%,transparent)_25%,' +
  'transparent_25%,transparent_75%,' +
  'color-mix(in_srgb,var(--sniptale-color-text-muted)_22%,transparent)_75%,' +
  'color-mix(in_srgb,var(--sniptale-color-text-muted)_22%,transparent))] ' +
  '[background-position:0_0,8px_8px] [background-size:16px_16px] ' +
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary)_4%,transparent)] ' +
  'outline-none touch-none focus-visible:ring-2 ' +
  'focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_52%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sniptale-color-surface-panel)]';

function useViewportPreviewHandlers(args: {
  controller: ReturnType<typeof useEditorController>;
  dragPointerIdRef: ReturnType<typeof useEditorViewportPreview>['dragPointerIdRef'];
  navigateFromClientPoint: ReturnType<typeof useEditorViewportPreview>['navigateFromClientPoint'];
  viewportCenter: ReturnType<typeof useEditorViewportPreview>['viewportCenter'];
}) {
  const { handlePointerDown, handlePointerMove, handlePointerRelease } =
    createEditorViewportPreviewPointerHandlers({
      dragPointerIdRef: args.dragPointerIdRef,
      navigateFromClientPoint: args.navigateFromClientPoint,
    });
  const handleSurfaceKeyDown = createEditorViewportPreviewKeyHandler({
    controller: args.controller,
    viewportCenter: args.viewportCenter,
  });

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerRelease,
    handleSurfaceKeyDown,
  };
}

function shouldRenderViewportPreview(args: {
  hasImage: boolean;
  viewport: { canvasHeight: number; canvasWidth: number };
  viewportPreviewOpen: boolean;
}) {
  return (
    args.hasImage &&
    args.viewportPreviewOpen &&
    args.viewport.canvasWidth > 0 &&
    args.viewport.canvasHeight > 0
  );
}

function useControllerCanvasRef(controller: ReturnType<typeof useEditorController>) {
  return React.useMemo(
    () =>
      ({
        get current() {
          const canvas = controller.canvas as { getElement?: () => HTMLCanvasElement } | null;
          return canvas?.getElement?.() ?? null;
        },
      }) as React.RefObject<HTMLCanvasElement | null>,
    [controller]
  );
}

function useViewportPreviewBaseState(forceOpen: boolean) {
  useAppLocale();
  const controller = useEditorController();
  const controllerCanvasRef = useControllerCanvasRef(controller);
  const { viewportPreviewOpen, viewport } = useEditorStore(
    useShallow((state) => ({
      viewportPreviewOpen: state.viewportPreviewOpen,
      viewport: state.viewport,
    }))
  );
  return {
    controller,
    controllerCanvasRef,
    viewport,
    viewportPreviewOpen: forceOpen || viewportPreviewOpen,
  };
}

function useViewportPreviewSurfaceProps({
  canvasRef,
  forceOpen = false,
  hasImage,
  maxWidth,
}: EditorViewportPreviewProps) {
  const { controller, controllerCanvasRef, viewport, viewportPreviewOpen } =
    useViewportPreviewBaseState(forceOpen);
  const {
    dragPointerIdRef,
    navigateFromClientPoint,
    previewCanvasRef,
    previewSize,
    previewSurfaceRef,
    viewportCenter,
    viewportFrame,
  } = useEditorViewportPreview({
    canvasRef: canvasRef ?? controllerCanvasRef,
    controller,
    hasImage,
    ...(maxWidth === undefined ? {} : { maxWidth }),
    viewport,
    viewportPreviewOpen,
  });
  const { handlePointerDown, handlePointerMove, handlePointerRelease, handleSurfaceKeyDown } =
    useViewportPreviewHandlers({
      controller,
      dragPointerIdRef,
      navigateFromClientPoint,
      viewportCenter,
    });

  return {
    shouldRender: shouldRenderViewportPreview({
      hasImage,
      viewport,
      viewportPreviewOpen,
    }),
    surfaceProps: createViewportPreviewSurfaceProps({
      handlePointerDown,
      handlePointerMove,
      handlePointerRelease,
      handleSurfaceKeyDown,
      previewCanvasRef,
      previewSize,
      previewSurfaceRef,
      viewportFrame,
    }),
  };
}

function createViewportPreviewSurfaceProps(args: {
  handlePointerDown: ReturnType<typeof useViewportPreviewHandlers>['handlePointerDown'];
  handlePointerMove: ReturnType<typeof useViewportPreviewHandlers>['handlePointerMove'];
  handlePointerRelease: ReturnType<typeof useViewportPreviewHandlers>['handlePointerRelease'];
  handleSurfaceKeyDown: ReturnType<typeof useViewportPreviewHandlers>['handleSurfaceKeyDown'];
  previewCanvasRef: ReturnType<typeof useEditorViewportPreview>['previewCanvasRef'];
  previewSize: ReturnType<typeof useEditorViewportPreview>['previewSize'];
  previewSurfaceRef: ReturnType<typeof useEditorViewportPreview>['previewSurfaceRef'];
  viewportFrame: ReturnType<typeof useEditorViewportPreview>['viewportFrame'];
}) {
  return {
    previewCanvasRef: args.previewCanvasRef,
    previewSize: args.previewSize,
    previewSurfaceRef: args.previewSurfaceRef,
    surfaceClassName: viewportPreviewSurfaceClassName,
    viewportFrame: args.viewportFrame,
    onKeyDown: args.handleSurfaceKeyDown,
    onPointerCancel: args.handlePointerRelease,
    onPointerDown: args.handlePointerDown,
    onPointerMove: args.handlePointerMove,
    onPointerUp: args.handlePointerRelease,
  };
}

export const EditorViewportPreview: React.FC<EditorViewportPreviewProps> = (props) => {
  const { shouldRender, surfaceProps } = useViewportPreviewSurfaceProps(props);
  if (!shouldRender) {
    return null;
  }

  if (props.variant === 'embedded') {
    return <EditorViewportPreviewContent {...surfaceProps} />;
  }

  return <EditorViewportPreviewSurface {...surfaceProps} />;
};
