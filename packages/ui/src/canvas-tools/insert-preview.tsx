import type React from 'react';

export interface CanvasInsertPreviewFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function CanvasInsertPreviewOverlay(props: {
  className?: string | undefined;
  dataUi?: string | undefined;
  frame: CanvasInsertPreviewFrame | null;
  minSize?: number | undefined;
  style?: React.CSSProperties | undefined;
}) {
  const minSize = props.minSize ?? 2;
  if (!props.frame || props.frame.width < minSize || props.frame.height < minSize) {
    return null;
  }

  return (
    <div
      aria-hidden
      data-ui={props.dataUi ?? 'shared.ui.canvas-tools.insert-preview'}
      className={[
        'pointer-events-none absolute z-30 rounded-[3px] border',
        'border-[var(--sniptale-color-border-accent-strong)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
        props.className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        height: props.frame.height,
        left: props.frame.x,
        top: props.frame.y,
        width: props.frame.width,
        ...props.style,
      }}
    />
  );
}
