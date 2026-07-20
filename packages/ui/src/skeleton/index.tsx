import type { HTMLAttributes } from 'react';

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  shape?: 'line' | 'block' | 'circle';
}

function getSkeletonShapeClassName(shape: SkeletonProps['shape']): string {
  switch (shape) {
    case undefined:
      return 'rounded-full';
    case 'circle':
      return 'rounded-full';
    case 'block':
      return 'rounded-[12px]';
    case 'line':
      return 'rounded-full';
  }

  return 'rounded-full';
}

function buildSkeletonClassName(
  shape: SkeletonProps['shape'],
  className: string | undefined
): string {
  return [
    'relative overflow-hidden',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,var(--sniptale-color-surface-panel)_12%)]',
    'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-border-strong)_14%,transparent)]',
    'animate-pulse',
    getSkeletonShapeClassName(shape),
    className ?? '',
  ].join(' ');
}

/**
 * Shared non-interactive loading placeholder for extension-owned UI surfaces.
 */
export function Skeleton({ shape = 'line', className, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={buildSkeletonClassName(shape, className)} {...props} />;
}
