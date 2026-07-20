import type { CSSProperties, ReactNode } from 'react';
import { TypeOutline } from 'lucide-react';
import { cx } from '../../chrome/ui';
import { TablerIcon, type TablerIconName } from './tabler-icon';

type ColorStatusIconProps = {
  children: ReactNode;
  className?: string | undefined;
  color: string;
  opacity?: number | undefined;
  showUnderline?: boolean | undefined;
};

export function TablerColorIcon(props: {
  className?: string;
  color: string;
  icon: TablerIconName;
  opacity?: number;
  showUnderline?: boolean;
  size?: number;
}) {
  return (
    <ColorStatusIcon
      className={props.className}
      color={props.color}
      opacity={props.opacity}
      showUnderline={props.showUnderline}
    >
      <TablerIcon icon={props.icon} size={props.size ?? 15} />
    </ColorStatusIcon>
  );
}

export function TypeOutlineColorIcon(props: {
  className?: string;
  color: string;
  opacity?: number;
  showUnderline?: boolean;
  size?: number;
}) {
  const size = props.size ?? 15;

  return (
    <ColorStatusIcon
      className={props.className}
      color={props.color}
      opacity={props.opacity}
      showUnderline={props.showUnderline}
    >
      <TypeOutline aria-hidden="true" size={size} strokeWidth={2} />
    </ColorStatusIcon>
  );
}

function ColorStatusIcon(props: ColorStatusIconProps) {
  const normalizedOpacity = normalizeIconOpacity(props.opacity);
  const showUnderline =
    props.showUnderline ?? (normalizedOpacity > 0 && !isTransparentColor(props.color));
  const style = createColorIconStyle(props.color, normalizedOpacity);

  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative grid h-5 w-5 place-items-center text-[color:var(--sniptale-color-text-secondary)]',
        props.className
      )}
      style={style}
    >
      <span className="relative z-10 grid place-items-center">{props.children}</span>
      {showUnderline ? (
        <span
          data-color-icon-underline=""
          className={[
            'pointer-events-none absolute left-1/2 top-[calc(100%+2px)] h-0.5 w-4',
            '-translate-x-1/2 rounded-full',
            'bg-[color:var(--editor-tabler-color-icon-color)]',
          ].join(' ')}
          style={{
            opacity: normalizedOpacity,
            boxShadow:
              '0 0 0 1px color-mix(in srgb, var(--sniptale-color-border-soft) 60%, transparent)',
          }}
        />
      ) : null}
    </span>
  );
}

function normalizeIconOpacity(opacity: number | undefined): number {
  return Math.max(0, Math.min(1, opacity ?? 1));
}

function createColorIconStyle(color: string, opacity: number): CSSProperties {
  return {
    '--editor-tabler-color-icon-color': color,
    '--editor-tabler-color-icon-opacity': opacity,
  } as CSSProperties;
}

function isTransparentColor(color: string): boolean {
  const value = color.trim();

  if (value === '' || value === 'transparent') {
    return true;
  }

  const rgbaMatch = /^rgba\([^,]+,[^,]+,[^,]+,\s*(0|0?\.0+)\s*\)$/i.exec(value);

  return rgbaMatch !== null;
}
