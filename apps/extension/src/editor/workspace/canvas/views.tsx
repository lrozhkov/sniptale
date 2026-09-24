import { FolderOpen, ImagePlus } from 'lucide-react';
import React from 'react';
import { translate } from '../../../platform/i18n';
import {
  AnnotatableImageSurface,
  annotatableImageCheckerboardStyle,
} from '@sniptale/ui/annotatable-image-surface';
import { getControlPrimaryButtonClassName } from '@sniptale/ui/control-language';
import {
  EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI,
  EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI,
  EDITOR_CANVAS_VIEWPORT_DATA_UI,
} from './context-menu/types';
import { EditorFrameAnnotationPlane } from '../../frame-annotation/plane';
import type { EditorFrameAnnotationPlaneController } from '../../frame-annotation/types';
import type { EditorLayerItem, EditorTool } from '../../../features/editor/document/types';
import {
  getEditorEditingSurfaceSize,
  getEditorWorkspaceMargin,
} from '../../controller/viewport/editing-surface';

const emptyStateButtonClassName = [
  'mt-5',
  getControlPrimaryButtonClassName({ density: 'compact' }),
].join(' ');

const stageClassName = 'box-border grid h-max min-h-full w-max min-w-full place-items-center';
const emptyStagePaddingClassName = 'px-6 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10';

const emptyStateTitleClassName =
  'mt-5 max-w-[420px] text-3xl font-semibold leading-tight ' +
  'text-[var(--sniptale-color-text-primary)]';

const emptyStateDropzoneBaseClassName =
  'relative flex w-full max-w-[560px] flex-col items-center rounded-2xl border px-7 py-9 ' +
  'text-center transition sm:px-10 sm:py-11';

const emptyStateDropzoneIdleClassName =
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_76%,var(--sniptale-color-surface-canvas)_24%)]';

const emptyStateDropzoneActiveClassName =
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_56%,var(--sniptale-color-border-soft)_44%)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_7%,var(--sniptale-color-surface-panel)_93%)]';

const emptyStateIconShellClassName =
  'grid size-12 place-items-center rounded-[14px] border ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)] ' +
  'text-[var(--sniptale-color-accent)]';

const emptyStateDropHintClassName =
  'mt-5 w-full rounded-xl border border-dashed ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_78%,transparent)] px-4 py-3';

interface CanvasEmptyStateProps {
  dragActive?: boolean;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onOpenImage: () => void;
}

export function CanvasViewport(props: {
  activeTool?: EditorTool;
  hasImage: boolean;
  backgroundColor: string;
  showOutsideCanvas?: boolean;
  canvasCropMode?: 'crop' | 'expand';
  controller?: EditorFrameAnnotationPlaneController;
  dataUi?: string;
  surfaceRef?: React.Ref<HTMLDivElement>;
  viewportRef: React.Ref<HTMLDivElement>;
  stageRef: React.Ref<HTMLDivElement>;
  canvasRef: React.Ref<HTMLCanvasElement>;
  gridStyle: React.CSSProperties | null;
  layers?: EditorLayerItem[];
}) {
  const surfaceStyle = props.hasImage
    ? ({
        borderWidth: 0,
        boxShadow: 'none',
        backgroundColor: props.backgroundColor,
      } satisfies React.CSSProperties)
    : undefined;

  return (
    <div
      ref={props.viewportRef}
      data-ui={props.dataUi ?? EDITOR_CANVAS_VIEWPORT_DATA_UI}
      className={
        props.hasImage
          ? 'relative z-0 h-full overflow-auto overscroll-contain [scrollbar-gutter:stable_both-edges]'
          : 'pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0'
      }
      style={props.hasImage ? { backgroundColor: props.backgroundColor } : undefined}
    >
      <CanvasStage {...props} surfaceStyle={surfaceStyle} />
    </div>
  );
}

function CanvasStage(
  props: Pick<
    Parameters<typeof CanvasViewport>[0],
    | 'activeTool'
    | 'canvasRef'
    | 'backgroundColor'
    | 'showOutsideCanvas'
    | 'canvasCropMode'
    | 'controller'
    | 'gridStyle'
    | 'hasImage'
    | 'layers'
    | 'stageRef'
    | 'surfaceRef'
  > & {
    surfaceStyle: React.CSSProperties | undefined;
  }
) {
  const documentSize = props.controller?.canvasDocumentSize ?? { width: 0, height: 0 };
  const surfaceSize = getEditorEditingSurfaceSize(documentSize);
  const margin = getEditorWorkspaceMargin(documentSize);
  const left = `${(margin / Math.max(1, surfaceSize.width)) * 100}%`;
  const top = `${(margin / Math.max(1, surfaceSize.height)) * 100}%`;
  const right = `${((margin + documentSize.width) / Math.max(1, surfaceSize.width)) * 100}%`;
  const bottom = `${((margin + documentSize.height) / Math.max(1, surfaceSize.height)) * 100}%`;
  const bottomInset = `${(margin / Math.max(1, surfaceSize.height)) * 100}%`;
  const imageStyle = {
    left,
    top,
    width: `${(documentSize.width / Math.max(1, surfaceSize.width)) * 100}%`,
    height: `${(documentSize.height / Math.max(1, surfaceSize.height)) * 100}%`,
  } satisfies React.CSSProperties;
  const freeCanvasSelection = props.activeTool === 'crop' && props.canvasCropMode === 'expand';
  const revealOutside = props.showOutsideCanvas !== false || freeCanvasSelection;
  const maskOpacity = freeCanvasSelection ? 'opacity-0' : revealOutside ? 'opacity-[0.78]' : '';
  const maskClassName = `pointer-events-none absolute z-40 ${maskOpacity}`;
  const maskStyle = { backgroundColor: props.backgroundColor };
  return (
    <div
      ref={props.stageRef}
      className={
        props.hasImage ? stageClassName : `${stageClassName} ${emptyStagePaddingClassName}`
      }
    >
      <div ref={props.surfaceRef} data-ui={EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI}>
        <AnnotatableImageSurface
          checkerboard={false}
          className={props.hasImage ? 'rounded-none' : 'border-transparent shadow-none'}
          {...(props.surfaceStyle === undefined ? {} : { style: props.surfaceStyle })}
        >
          <div
            className="pointer-events-none absolute z-0"
            data-ui="editor.canvas.document-checkerboard"
            style={
              props.hasImage && documentSize.width > 0 && documentSize.height > 0
                ? { ...annotatableImageCheckerboardStyle, ...imageStyle, clipPath: 'inset(1px)' }
                : { display: 'none' }
            }
          />
          <canvas ref={props.canvasRef} className="relative z-10 block" />
          {props.hasImage && props.controller ? (
            <EditorFrameAnnotationPlane
              activeTool={props.activeTool ?? 'select'}
              canvasRef={props.canvasRef as React.RefObject<HTMLCanvasElement | null>}
              controller={props.controller}
              layers={props.layers ?? []}
            />
          ) : null}
          {props.hasImage && props.gridStyle ? (
            <div
              className="pointer-events-none absolute z-20"
              data-ui="editor.canvas.document-grid"
              style={{ ...imageStyle, ...props.gridStyle }}
            />
          ) : null}
          {props.hasImage && documentSize.width > 0 && documentSize.height > 0 ? (
            <>
              <div
                className={maskClassName}
                style={{ ...maskStyle, left: 0, right: 0, top: 0, height: top }}
              />
              <div
                className={maskClassName}
                style={{ ...maskStyle, left: 0, right: 0, top: bottom, bottom: 0 }}
              />
              <div
                className={maskClassName}
                data-ui="editor.canvas.workspace-mask-left"
                style={{ ...maskStyle, left: 0, top, bottom: bottomInset, width: left }}
              />
              <div
                className={maskClassName}
                data-ui="editor.canvas.workspace-mask-right"
                style={{ ...maskStyle, left: right, top, bottom: bottomInset, right: 0 }}
              />
              <div
                className="pointer-events-none absolute z-40 border border-[var(--sniptale-color-border-soft)]"
                data-ui="editor.canvas.document-boundary"
                style={imageStyle}
              />
            </>
          ) : null}
        </AnnotatableImageSurface>
      </div>
    </div>
  );
}

export function CanvasEmptyState(props: CanvasEmptyStateProps) {
  const dropzoneClassName = [
    emptyStateDropzoneBaseClassName,
    props.dragActive ? emptyStateDropzoneActiveClassName : emptyStateDropzoneIdleClassName,
  ].join(' ');
  const dropzoneTitle = props.dragActive
    ? translate('editor.canvas.emptyDropzoneActive')
    : translate('editor.canvas.emptyDropzoneTitle');

  return (
    <div className="absolute inset-0 z-10 grid place-items-center px-6 py-10 sm:px-10">
      <div
        aria-label={translate('editor.canvas.emptyDropzoneLabel')}
        className={dropzoneClassName}
        data-ui={EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI}
        onDragLeave={props.onDragLeave}
        onDragOver={props.onDragOver}
        onDrop={props.onDrop}
      >
        <div className={emptyStateIconShellClassName}>
          <ImagePlus size={23} strokeWidth={1.8} />
        </div>
        <h1 className={emptyStateTitleClassName}>{translate('editor.canvas.emptyTitle')}</h1>
        <p className="mt-3 max-w-[440px] text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.canvas.emptyDescription')}
        </p>
        <button type="button" className={emptyStateButtonClassName} onClick={props.onOpenImage}>
          <FolderOpen size={16} strokeWidth={2} />
          <span>{translate('editor.canvas.openImage')}</span>
        </button>
        <div className={emptyStateDropHintClassName}>
          <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {dropzoneTitle}
          </div>
          <div className="mt-2 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('editor.canvas.emptyDropzoneHint')}
          </div>
        </div>
      </div>
    </div>
  );
}
