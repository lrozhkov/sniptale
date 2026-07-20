import type { CSSProperties, PropsWithChildren } from 'react';

const checkerboardCellColor =
  'color-mix(in srgb, var(--sniptale-color-text-muted) 18%, transparent)';

const checkerGradientLayer = [
  'linear-gradient(45deg,',
  `${checkerboardCellColor} 25%,`,
  'transparent 25%, transparent 75%,',
  `${checkerboardCellColor} 75%,`,
  `${checkerboardCellColor})`,
].join(' ');

const surfaceClassName =
  'relative overflow-hidden rounded-[18px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[var(--sniptale-color-surface-panel)] ' +
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_14%,transparent)]';

const checkerboardStyle: CSSProperties = {
  backgroundColor:
    'color-mix(in srgb, var(--sniptale-color-surface-canvas) 54%, var(--sniptale-color-surface-panel) 46%)',
  backgroundImage: `${checkerGradientLayer},${checkerGradientLayer}`,
  backgroundPositionX: '0px, 10px',
  backgroundPositionY: '0px, 10px',
  backgroundSize: '20px 20px',
};

/**
 * Shared stage shell for image-based editing and preview surfaces.
 */
export function AnnotatableImageSurface(
  props: PropsWithChildren<{
    className?: string;
    checkerboard?: boolean;
    style?: CSSProperties;
  }>
) {
  const style = props.checkerboard
    ? {
        ...checkerboardStyle,
        ...props.style,
      }
    : props.style;

  return (
    <div
      className={[surfaceClassName, props.className ?? ''].filter(Boolean).join(' ')}
      style={style}
    >
      {props.children}
    </div>
  );
}

/**
 * Shared toolbar shell for image editing surfaces.
 */
export function AnnotatableImageToolbar(
  props: PropsWithChildren<{
    className?: string;
  }>
) {
  return (
    <div
      className={[
        'flex min-w-0 items-start gap-2 rounded-[18px] border',
        [
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
        ].join(' '),
        'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_12%,transparent)]',
        props.className ?? '',
      ].join(' ')}
    >
      {props.children}
    </div>
  );
}
