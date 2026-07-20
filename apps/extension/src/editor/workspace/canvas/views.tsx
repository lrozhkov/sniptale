import { FolderOpen, ImagePlus } from 'lucide-react';
import React from 'react';
import { translate } from '../../../platform/i18n';
import { AnnotatableImageSurface } from '@sniptale/ui/annotatable-image-surface';
import { getControlPrimaryButtonClassName } from '@sniptale/ui/control-language';
import {
  EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI,
  EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI,
  EDITOR_CANVAS_VIEWPORT_DATA_UI,
} from './context-menu/types';
import { EditorRasterOverlay } from './raster-overlay';

const emptyStateButtonClassName = [
  'mt-5',
  getControlPrimaryButtonClassName({ density: 'compact' }),
].join(' ');

const stageClassName =
  'box-border grid h-max min-h-full w-max min-w-full place-items-center ' +
  'px-6 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10';

const stagePannableStyle = {
  minHeight: 'calc(100% + max(32rem, 100vh))',
  minWidth: 'calc(100% + max(48rem, 130vw))',
  padding: 'max(16rem, 50vh) max(24rem, 65vw)',
} satisfies React.CSSProperties;

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
  hasImage: boolean;
  backgroundColor: string;
  dataUi?: string;
  surfaceRef?: React.Ref<HTMLDivElement>;
  viewportRef: React.Ref<HTMLDivElement>;
  stageRef: React.Ref<HTMLDivElement>;
  canvasRef: React.Ref<HTMLCanvasElement>;
  gridStyle: React.CSSProperties | null;
}) {
  const surfaceStyle = props.hasImage
    ? ({
        borderWidth: 0,
        boxShadow: 'none',
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
    'canvasRef' | 'gridStyle' | 'hasImage' | 'stageRef' | 'surfaceRef'
  > & {
    surfaceStyle: React.CSSProperties | undefined;
  }
) {
  return (
    <div
      ref={props.stageRef}
      className={stageClassName}
      style={props.hasImage ? stagePannableStyle : undefined}
    >
      <div ref={props.surfaceRef} data-ui={EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI}>
        <AnnotatableImageSurface
          checkerboard={props.hasImage}
          className={props.hasImage ? 'rounded-none' : 'border-transparent shadow-none'}
          {...(props.surfaceStyle === undefined ? {} : { style: props.surfaceStyle })}
        >
          <canvas ref={props.canvasRef} className="relative z-10 block" />
          <EditorRasterOverlay
            canvasRef={props.canvasRef as React.RefObject<HTMLCanvasElement | null>}
            hasImage={props.hasImage}
          />
          {props.hasImage && props.gridStyle ? (
            <div className="pointer-events-none absolute inset-0 z-20" style={props.gridStyle} />
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
