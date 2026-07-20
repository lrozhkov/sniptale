import type { ReactNode, SVGProps } from 'react';

type ContentStrokeIconProps = SVGProps<SVGSVGElement> & {
  children: ReactNode;
  size?: number | string;
};

export function ContentStrokeIcon({
  children,
  size,
  viewBox = '0 0 24 24',
  width,
  height,
  ...props
}: ContentStrokeIconProps) {
  return (
    <svg
      {...props}
      width={width ?? size}
      height={height ?? size}
      viewBox={viewBox}
      fill={props.fill ?? 'none'}
      stroke={props.stroke ?? 'currentColor'}
      strokeWidth={props.strokeWidth ?? '2'}
      strokeLinecap={props.strokeLinecap ?? 'round'}
      strokeLinejoin={props.strokeLinejoin ?? 'round'}
    >
      {children}
    </svg>
  );
}

export function PopoverCheckIcon() {
  return (
    <ContentStrokeIcon className="sniptale-popover-check" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </ContentStrokeIcon>
  );
}

export function AiSparkIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <ContentStrokeIcon className={className} size={size} strokeWidth="2">
      <g transform="scale(-1, 1) translate(-24, 0)">
        <path
          d={
            'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 ' +
            '0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72'
          }
        />
        <path d="m14 7 3 3" />
        <path d="M5 6v4" />
        <path d="M19 14v4" />
        <path d="M10 2v2" />
        <path d="M7 8H3" />
        <path d="M21 16h-4" />
        <path d="M11 3H9" />
      </g>
    </ContentStrokeIcon>
  );
}
