import React from 'react';
import { AnnotatableImageToolbar } from '../annotatable-image-surface';
import { DISABLED_EDITOR_ICON_HOVER_CLASS_NAME } from './styles.constants';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const EDITOR_FIELD_BORDER_CLASS_NAME = 'border-[color:var(--sniptale-color-border-soft)]';
const EDITOR_ICON_BUTTON_BASE_CLASS_NAME = [
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border outline-none',
  'cursor-pointer',
  'transition-all duration-150 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
].join(' ');
const EDITOR_ICON_BUTTON_IDLE_CLASS_NAME = [
  'border-transparent bg-transparent',
  'text-[var(--sniptale-color-text-secondary)] active:translate-y-px',
].join(' ');
const EDITOR_ICON_BUTTON_DEFAULT_TONE_CLASS_NAME = [
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_84%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');
const EDITOR_ICON_BUTTON_DANGER_TONE_CLASS_NAME = [
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_22%,var(--sniptale-color-border-soft)_78%)]',
  'hover:text-[var(--sniptale-color-danger)]',
].join(' ');
const EDITOR_ICON_BUTTON_ACTIVE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_34%,var(--sniptale-color-border-soft)_66%)]',
  'text-[var(--sniptale-color-accent)]',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_42%,var(--sniptale-color-border-soft)_58%)]',
  'hover:text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');
export const EDITOR_TOOLBAR_SECTION_CLASS_NAME =
  'flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 px-0.5 sm:flex-nowrap sm:px-1.5';
const EDITOR_TOOLBAR_DIVIDER_CLASS_NAME = 'mx-2.5 hidden h-8 lg:block';

export function EditorToolbarShell({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <AnnotatableImageToolbar
      className={joinClassNames(
        'shrink-0 items-stretch gap-0 rounded-none border-x-0 border-t-0',
        className
      )}
    >
      {children}
    </AnnotatableImageToolbar>
  );
}

export function EditorToolbarDivider({ className }: { className?: string }) {
  return <EditorDivider className={joinClassNames(EDITOR_TOOLBAR_DIVIDER_CLASS_NAME, className)} />;
}

export function EditorToolbarSection({
  children,
  className,
  dataUi,
}: React.PropsWithChildren<{ className?: string; dataUi?: string }>) {
  return (
    <div
      className={joinClassNames(EDITOR_TOOLBAR_SECTION_CLASS_NAME, className)}
      {...(dataUi === undefined ? {} : { 'data-ui': dataUi })}
    >
      {children}
    </div>
  );
}

export function EditorDivider({
  vertical = true,
  className,
}: {
  vertical?: boolean;
  className?: string;
}) {
  return (
    <div
      className={joinClassNames(
        vertical ? 'h-full w-px min-h-4' : 'h-px w-full',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_68%,transparent)]',
        className
      )}
    />
  );
}

export const EditorIconButton = React.forwardRef<
  HTMLButtonElement,
  {
    title: string;
    onClick?: () => void;
    onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
    children: React.ReactNode;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
    'data-ui'?: string;
  }
>(function EditorIconButton(
  { title, onClick, onMouseDown, children, active, danger, disabled, className, 'data-ui': dataUi },
  ref
) {
  const buttonClassName = getEditorIconButtonClassName({
    ...(active === undefined ? {} : { active }),
    ...(className === undefined ? {} : { className }),
    ...(danger === undefined ? {} : { danger }),
    ...(disabled === undefined ? {} : { disabled }),
  });

  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={onMouseDown}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-active={active ? 'true' : 'false'}
      {...(dataUi === undefined ? {} : { 'data-ui': dataUi })}
      className={buttonClassName}
    >
      {children}
    </button>
  );
});

function getEditorIconButtonClassName(props: {
  active?: boolean;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return joinClassNames(
    EDITOR_ICON_BUTTON_BASE_CLASS_NAME,
    props.active ? '' : EDITOR_ICON_BUTTON_IDLE_CLASS_NAME,
    props.active
      ? EDITOR_ICON_BUTTON_ACTIVE_CLASS_NAME
      : props.danger
        ? EDITOR_ICON_BUTTON_DANGER_TONE_CLASS_NAME
        : EDITOR_ICON_BUTTON_DEFAULT_TONE_CLASS_NAME,
    props.disabled &&
      [
        'cursor-default opacity-55',
        DISABLED_EDITOR_ICON_HOVER_CLASS_NAME,
        'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
        'hover:text-[var(--sniptale-color-text-secondary)]',
        'active:translate-y-0',
      ].join(' '),
    props.className
  );
}

export function ValueBadge({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={joinClassNames(
        [
          'inline-flex items-center rounded-md border',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_58%,transparent)]',
          EDITOR_FIELD_BORDER_CLASS_NAME,
          'px-2 py-1 text-xs',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' '),
        className
      )}
    >
      {children}
    </span>
  );
}
