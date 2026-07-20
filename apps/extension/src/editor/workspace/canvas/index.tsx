import React, { useRef } from 'react';
import { useEditorController } from '../../application/controller-context';
import { useCanvasImageIntake } from './use-intake';
import { useCanvasWrapperState } from './use-state';
import { CanvasWrapperSurface } from './surface';
import { useCanvasContextMenuOwner } from './use-context-menu';
import { useCanvasGridStyle } from './grid-style';
import { useCanvasMountEffect } from './mount-effect';

interface CanvasWrapperProps {
  hasImage: boolean;
}

const CANVAS_WRAPPER_GRID_OVERLAY_CLASS_NAME = [
  'pointer-events-none absolute inset-0 opacity-[0.16]',
  [
    '[background-image:linear-gradient(',
    'color-mix(in_srgb,var(--sniptale-color-text-muted)_18%,transparent)_1px,transparent_1px),',
  ].join(''),
  [
    'linear-gradient(90deg,color-mix(in_srgb,var(--sniptale-color-text-muted)_18%,transparent)_1px,',
    'transparent_1px)]',
  ].join(''),
  '[background-size:28px_28px]',
].join(' ');

function useCanvasWrapperSurfaceProps(args: {
  closeContextMenu: () => void;
  contextMenuState: ReturnType<typeof useCanvasContextMenuOwner>['contextMenuState'];
  controller: ReturnType<typeof useEditorController>;
  gridStyle: React.CSSProperties | null;
  handleCanvasContextMenu: ReturnType<typeof useCanvasContextMenuOwner>['handleCanvasContextMenu'];
  hasImage: boolean;
  imageIntake: Omit<ReturnType<typeof useCanvasImageIntake>, 'openImageFile'>;
  openImageFile: (file: File | undefined) => void;
  state: ReturnType<typeof useCanvasWrapperState>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  return {
    backgroundColor: args.state.backgroundColor,
    canvasRef: args.state.canvasRef,
    contextMenuState: args.contextMenuState,
    controller: args.controller,
    gridOverlayClassName: CANVAS_WRAPPER_GRID_OVERLAY_CLASS_NAME,
    gridStyle: args.gridStyle,
    handleCanvasContextMenu: args.handleCanvasContextMenu,
    hasImage: args.hasImage,
    imageIntake: args.imageIntake,
    layers: args.state.layers,
    onCloseContextMenu: args.closeContextMenu,
    openImageFile: args.openImageFile,
    openImageInputRef: args.state.openImageInputRef,
    surfaceRef: args.state.surfaceRef,
    stageRef: args.state.stageRef,
    viewportRef: args.state.viewportRef,
    wrapperRef: args.wrapperRef,
  };
}

export const CanvasWrapper: React.FC<CanvasWrapperProps> = ({ hasImage }) => {
  const controller = useEditorController();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const state = useCanvasWrapperState();
  const { openImageFile, ...imageIntake } = useCanvasImageIntake({
    controller,
    hasImage,
    openImageInputRef: state.openImageInputRef,
    setImageData: state.setImageData,
  });

  const gridStyle = useCanvasGridStyle({
    gridEnabled: state.gridEnabled,
    zoomPercent: state.zoomPercent,
    gridSize: state.gridSize,
    gridColor: state.gridColor,
  });

  useCanvasMountEffect({
    controller,
    viewportRef: state.viewportRef,
    stageRef: state.stageRef,
    canvasRef: state.canvasRef,
  });
  const { closeContextMenu, contextMenuState, handleCanvasContextMenu } = useCanvasContextMenuOwner(
    {
      controller,
      hasImage,
      layers: state.layers,
      selection: state.selection,
      surfaceRef: state.surfaceRef,
      wrapperRef,
    }
  );
  const surfaceProps = useCanvasWrapperSurfaceProps({
    closeContextMenu,
    contextMenuState,
    controller,
    gridStyle,
    handleCanvasContextMenu,
    hasImage,
    imageIntake,
    openImageFile,
    state,
    wrapperRef,
  });

  return <CanvasWrapperSurface {...surfaceProps} />;
};
