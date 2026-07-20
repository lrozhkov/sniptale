import type { HTMLAttributes, ReactNode } from 'react';

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export interface ProductGlassSectionLabelProps extends HTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

export interface ProductGlassOptionGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ProductGlassRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  spread?: boolean;
}

export interface ProductGlassThreeColumnGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ProductGlassArrowGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ProductGlassColorRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ProductGlassDimMarkerProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export interface ProductGlassToggleRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
}

export function ProductGlassSectionLabel({
  children,
  className = '',
  ...props
}: ProductGlassSectionLabelProps) {
  return (
    <label className={joinClassNames('sniptale-glass-section-label', className)} {...props}>
      {children}
    </label>
  );
}

export function ProductGlassOptionGrid({
  children,
  className = '',
  ...props
}: ProductGlassOptionGridProps) {
  return (
    <div className={joinClassNames('sniptale-glass-option-grid', className)} {...props}>
      {children}
    </div>
  );
}

export function ProductGlassRow({
  children,
  spread = false,
  className = '',
  ...props
}: ProductGlassRowProps) {
  return (
    <div
      className={joinClassNames(
        'sniptale-glass-row',
        spread && 'sniptale-glass-row--spread',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ProductGlassThreeColumnGrid({
  children,
  className = '',
  ...props
}: ProductGlassThreeColumnGridProps) {
  return (
    <div className={joinClassNames('sniptale-glass-grid-3', className)} {...props}>
      {children}
    </div>
  );
}

export function ProductGlassArrowGrid({
  children,
  className = '',
  ...props
}: ProductGlassArrowGridProps) {
  return (
    <div className={joinClassNames('sniptale-glass-arrow-grid', className)} {...props}>
      {children}
    </div>
  );
}

export function ProductGlassColorRow({
  children,
  className = '',
  ...props
}: ProductGlassColorRowProps) {
  return (
    <div className={joinClassNames('sniptale-glass-color-row', className)} {...props}>
      {children}
    </div>
  );
}

export function ProductGlassDimMarker({
  children,
  className = '',
  ...props
}: ProductGlassDimMarkerProps) {
  return (
    <span className={joinClassNames('sniptale-glass-dim', className)} {...props}>
      {children}
    </span>
  );
}

export function ProductGlassToggleRow({
  title,
  hint,
  control,
  className = '',
  ...props
}: ProductGlassToggleRowProps) {
  return (
    <div className={joinClassNames('sniptale-glass-toggle-row', className)} {...props}>
      <div className="sniptale-glass-toggle-copy">
        <span className="sniptale-glass-toggle-title">{title}</span>
        {hint ? <span className="sniptale-glass-toggle-hint">{hint}</span> : null}
      </div>
      {control}
    </div>
  );
}
