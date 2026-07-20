import React from 'react';
import { CanvasContextMenu } from './context-menu';
import {
  EDITOR_CANVAS_CONTEXT_ZONE_DATA_UI,
  type CanvasContextMenuController,
  type CanvasContextMenuState,
} from './context-menu/types';
import type { useCanvasImageIntake } from './use-intake';
import type { useCanvasWrapperState } from './use-state';
import { CanvasEmptyState, CanvasViewport } from './views';

const canvasWrapperClassName =
  'relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--sniptale-color-surface-canvas)]';

function CanvasContextZone(props: {
  backgroundColor: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  contextMenuState: CanvasContextMenuState | null;
  controller: CanvasContextMenuController;
  gridStyle: React.CSSProperties | null;
  handleCanvasContextMenu: React.MouseEventHandler<HTMLDivElement>;
  hasImage: boolean;
  imageIntake: Omit<ReturnType<typeof useCanvasImageIntake>, 'openImageFile'>;
  layers: ReturnType<typeof useCanvasWrapperState>['layers'];
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onCloseContextMenu: () => void;
}) {
  return (
    <div
      className="absolute inset-0"
      data-ui={EDITOR_CANVAS_CONTEXT_ZONE_DATA_UI}
      onContextMenu={props.handleCanvasContextMenu}
    >
      <CanvasViewport
        hasImage={props.hasImage}
        backgroundColor={props.backgroundColor}
        viewportRef={props.viewportRef}
        stageRef={props.stageRef}
        surfaceRef={props.surfaceRef}
        canvasRef={props.canvasRef}
        gridStyle={props.gridStyle}
      />
      {!props.hasImage ? <CanvasEmptyState {...props.imageIntake} /> : null}
      {props.contextMenuState ? (
        <CanvasContextMenu
          controller={props.controller}
          layers={props.layers}
          onClose={props.onCloseContextMenu}
          onOpenImage={props.imageIntake.onOpenImage}
          state={props.contextMenuState}
        />
      ) : null}
    </div>
  );
}

function CanvasSurfaceChrome(props: {
  gridOverlayClassName: string;
  openImageFile: (file: File | undefined) => void;
  openImageInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <input
        ref={props.openImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          props.openImageFile(file);
        }}
      />
      <div className={props.gridOverlayClassName} />
    </>
  );
}

interface CanvasWrapperSurfaceProps {
  backgroundColor: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  contextMenuState: CanvasContextMenuState | null;
  controller: CanvasContextMenuController;
  gridOverlayClassName: string;
  gridStyle: React.CSSProperties | null;
  handleCanvasContextMenu: React.MouseEventHandler<HTMLDivElement>;
  hasImage: boolean;
  imageIntake: Omit<ReturnType<typeof useCanvasImageIntake>, 'openImageFile'>;
  layers: ReturnType<typeof useCanvasWrapperState>['layers'];
  openImageFile: (file: File | undefined) => void;
  openImageInputRef: React.RefObject<HTMLInputElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  onCloseContextMenu: () => void;
}

function CanvasWrapperShell(props: {
  imageIntake: CanvasWrapperSurfaceProps['imageIntake'];
  wrapperRef: CanvasWrapperSurfaceProps['wrapperRef'];
  children: React.ReactNode;
}) {
  return (
    <div
      ref={props.wrapperRef}
      className={canvasWrapperClassName}
      data-ui="editor.canvas.wrapper"
      onDragLeave={props.imageIntake.onDragLeave}
      onDragOver={props.imageIntake.onDragOver}
      onDrop={props.imageIntake.onDrop}
    >
      {props.children}
    </div>
  );
}

export function CanvasWrapperSurface(props: CanvasWrapperSurfaceProps) {
  return (
    <CanvasWrapperShell imageIntake={props.imageIntake} wrapperRef={props.wrapperRef}>
      <CanvasSurfaceChrome
        gridOverlayClassName={props.gridOverlayClassName}
        openImageFile={props.openImageFile}
        openImageInputRef={props.openImageInputRef}
      />
      <CanvasContextZone
        backgroundColor={props.backgroundColor}
        canvasRef={props.canvasRef}
        contextMenuState={props.contextMenuState}
        controller={props.controller}
        gridStyle={props.gridStyle}
        handleCanvasContextMenu={props.handleCanvasContextMenu}
        hasImage={props.hasImage}
        imageIntake={props.imageIntake}
        layers={props.layers}
        surfaceRef={props.surfaceRef}
        stageRef={props.stageRef}
        viewportRef={props.viewportRef}
        onCloseContextMenu={props.onCloseContextMenu}
      />
    </CanvasWrapperShell>
  );
}
