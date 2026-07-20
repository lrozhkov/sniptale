import type React from 'react';
import { PANEL_META_CLASS_NAME } from '../shared/panel';

export function InspectorGroupSection(props: {
  children: React.ReactNode;
  label?: string;
  meta?: React.ReactNode;
}) {
  const headerVisible = props.label || props.meta;

  return (
    <section className="space-y-3">
      {headerVisible ? (
        <div className="flex items-baseline justify-between gap-3">
          {props.label ? <p className={PANEL_META_CLASS_NAME}>{props.label}</p> : <span />}
          {props.meta ? (
            <span className="text-[11px] font-medium text-[var(--sniptale-color-text-secondary)]">
              {props.meta}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3">{props.children}</div>
    </section>
  );
}
