import { TablerIcon } from './tabler-icon';

function isTransparentBorder(args: { color?: string; opacity?: number; strokeWidth?: number }) {
  return (
    (args.strokeWidth ?? 1) <= 0 ||
    (args.opacity ?? 1) <= 0.01 ||
    args.color === undefined ||
    ['transparent', '#0000', '#00000000'].includes(args.color.toLowerCase())
  );
}

function resolveBorderDashArray(strokeStyle?: string) {
  if (strokeStyle === 'dot') {
    return '1 4';
  }
  if (strokeStyle === 'dash') {
    return '4 3';
  }
  if (strokeStyle === 'dash-dot') {
    return '5 3 1 3';
  }
  if (strokeStyle === 'long-dash') {
    return '7 3';
  }

  return undefined;
}

export function TablerBorderIcon(props: {
  color?: string;
  opacity?: number;
  size?: number;
  strokeStyle?: string;
  strokeWidth?: number;
}) {
  const transparent = isTransparentBorder(props);
  const dotClassName =
    'absolute h-1 w-1 rounded-full bg-[color:var(--sniptale-color-text-primary)] opacity-80';
  const optionalIconProps = {
    ...(props.color === undefined ? {} : { color: props.color }),
    ...(transparent
      ? { opacity: 0 }
      : props.opacity === undefined
        ? {}
        : { opacity: props.opacity }),
  };

  return (
    <span aria-hidden="true" className="relative grid h-5 w-5 place-items-center">
      <TablerIcon
        icon="tabler:border-outer"
        size={props.size ?? 17}
        style={{ strokeDasharray: resolveBorderDashArray(props.strokeStyle) }}
        {...optionalIconProps}
      />
      {transparent ? (
        <>
          <span className={`${dotClassName} left-[7px] top-[5px]`} />
          <span className={`${dotClassName} left-[5px] top-[10px]`} />
          <span className={`${dotClassName} left-[10px] top-[10px]`} />
          <span className={`${dotClassName} right-[5px] top-[10px]`} />
          <span className={`${dotClassName} left-[10px] bottom-[5px]`} />
        </>
      ) : null}
    </span>
  );
}
