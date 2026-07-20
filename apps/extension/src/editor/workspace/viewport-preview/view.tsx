import type { CSSProperties, KeyboardEvent, PointerEvent, Ref } from 'react';
import { translate } from '../../../platform/i18n';

const viewportPreviewRootClassName =
  'pointer-events-auto absolute right-3 top-3 z-30 select-none rounded-[14px] border ' +
  'max-[720px]:top-[4.75rem] ' +
  'border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] p-3 ' +
  'shadow-sm';

const viewportPreviewFrameClassName =
  'pointer-events-none absolute rounded-[10px] border ' +
  'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)] ' +
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]';

export function EditorViewportPreviewContent(props: {
  previewCanvasRef: Ref<HTMLCanvasElement>;
  previewSize: { width: number; height: number };
  previewSurfaceRef: Ref<HTMLDivElement>;
  surfaceClassName: string;
  viewportFrame: CSSProperties | null;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      ref={props.previewSurfaceRef}
      role="button"
      tabIndex={0}
      aria-label={translate('editor.toolbar.previewNavigation')}
      onKeyDown={props.onKeyDown}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      className={props.surfaceClassName}
      style={{ width: props.previewSize.width, height: props.previewSize.height }}
    >
      <canvas ref={props.previewCanvasRef} className="absolute inset-0 h-full w-full" />
      {props.viewportFrame ? (
        <div className={viewportPreviewFrameClassName} style={props.viewportFrame} />
      ) : null}
    </div>
  );
}

export function EditorViewportPreviewSurface(
  props: Parameters<typeof EditorViewportPreviewContent>[0]
) {
  return (
    <div data-ui="editor.viewport-preview.root" className={viewportPreviewRootClassName}>
      <EditorViewportPreviewContent {...props} />
    </div>
  );
}
