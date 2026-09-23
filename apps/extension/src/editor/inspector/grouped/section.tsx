import type React from 'react';

export const EDITOR_INSPECTOR_GROUP_META_CLASS_NAME =
  'text-[length:var(--sniptale-compact-font-size,12px)] text-[var(--sniptale-color-text-secondary)]';

export function EditorInspectorGroupSection(props: {
  children: React.ReactNode;
  label?: string;
  meta?: React.ReactNode;
}) {
  const headerVisible = props.label || props.meta;

  return (
    <section className="space-y-2">
      {headerVisible ? (
        <div className="flex items-baseline justify-between gap-3">
          {props.label ? (
            <p className={EDITOR_INSPECTOR_GROUP_META_CLASS_NAME}>{props.label}</p>
          ) : (
            <span />
          )}
          {props.meta ? (
            <span className="text-[11px] font-medium text-[var(--sniptale-color-text-secondary)]">
              {props.meta}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}
