import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Section(props: {
  children: ReactNode;
  defaultCollapsed?: boolean;
  summary: string;
  title: string;
}) {
  const [open, setOpen] = useState(() => !props.defaultCollapsed);

  useEffect(() => {
    setOpen(!props.defaultCollapsed);
  }, [props.defaultCollapsed]);

  return (
    <details
      open={open}
      className={[
        'grid gap-2 border-t border-[color:var(--sniptale-color-border-soft)] py-2.5 first:border-t-0 first:pt-0',
      ].join(' ')}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ChevronDown
            size={13}
            className={[
              'shrink-0 text-[var(--sniptale-color-text-dim)] transition-transform',
              open ? 'rotate-0' : '-rotate-90',
            ].join(' ')}
          />
          <h3 className="truncate text-xs font-bold text-[var(--sniptale-color-text-primary)]">
            {props.title}
          </h3>
        </span>
        <span className="shrink-0 text-[10px] font-semibold text-[var(--sniptale-color-text-dim)]">
          {props.summary}
        </span>
      </summary>
      <div className="grid min-w-0 gap-2">{props.children}</div>
    </details>
  );
}
