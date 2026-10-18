import type React from 'react';

export const EDITOR_INSPECTOR_GROUP_META_CLASS_NAME =
  'text-[length:var(--sniptale-compact-font-size,13px)] text-[var(--sniptale-color-text-secondary)]';

export function EditorInspectorGroupSection(props: {
  children: React.ReactNode;
  label?: string;
  meta?: React.ReactNode;
}) {
  const headerVisible = props.label || props.meta;

  return (
    <section className="sniptale-parameter-stack">
      {headerVisible ? (
        <div className="flex items-baseline justify-between gap-3">
          {props.label ? (
            <p className={EDITOR_INSPECTOR_GROUP_META_CLASS_NAME}>{props.label}</p>
          ) : (
            <span />
          )}
          {props.meta ? (
            <span className="text-[12px] font-normal text-[var(--sniptale-color-text-secondary)]">
              {props.meta}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="sniptale-parameter-stack">{props.children}</div>
    </section>
  );
}
