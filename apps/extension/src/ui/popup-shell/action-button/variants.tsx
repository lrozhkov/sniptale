import type { ComponentType, ReactNode } from 'react';
import {
  PopupActionButtonCompactContent,
  PopupActionButtonDefaultContent,
  PopupActionButtonIcon,
} from './content';

const COMPACT_BUTTON_CLASS_NAME =
  'relative flex h-10 min-h-10 w-full min-w-0 items-center justify-center overflow-hidden';

const COMPACT_BUTTON_SURFACE_CLASS_NAME =
  'rounded-[6px] px-0 outline-none transition-colors duration-150';

const DEFAULT_BUTTON_CLASS_NAME =
  'relative flex h-10 min-h-10 min-w-0 items-center gap-1.5 overflow-hidden';

const DEFAULT_BUTTON_SURFACE_CLASS_NAME = [
  'rounded-[6px] px-2 text-[13px] font-normal leading-tight',
  'enabled:hover:font-medium enabled:focus-visible:font-medium',
].join(' ');

const DEFAULT_BUTTON_INTERACTION_CLASS_NAME = [
  'group outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
  'focus-visible:outline-solid focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const COMPACT_BUTTON_INTERACTION_CLASS_NAME = [
  'group focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
  'focus-visible:outline-solid focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

interface PopupActionButtonVariantProps {
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  subtitle?: ReactNode;
  ariaLabel?: string;
  iconClassName: string;
  disabled: boolean;
  title?: string;
  onClick: () => void;
  trailing?: ReactNode;
  dataUi?: string;
  rootClassName: string;
  centered?: boolean;
}

function renderPopupActionButtonFrame(args: {
  classNames: string[];
  content: ReactNode;
  props: PopupActionButtonVariantProps;
}) {
  const frame = resolvePopupActionButtonFrameProps(args.props, args.classNames);

  return (
    <button {...frame.buttonProps}>
      <PopupActionButtonIcon
        icon={frame.icon}
        iconClassName={frame.iconClassName}
        disabled={frame.disabled}
      />
      {args.content}
    </button>
  );
}

function resolvePopupActionButtonFrameProps(
  props: PopupActionButtonVariantProps,
  classNames: string[]
) {
  const resolvedAriaLabel =
    props.ariaLabel ?? props.title ?? (typeof props.label === 'string' ? props.label : undefined);

  return {
    disabled: props.disabled,
    icon: props.icon,
    iconClassName: props.iconClassName,
    label: props.label,
    onClick: props.onClick,
    resolvedAriaLabel,
    subtitle: props.subtitle,
    title: props.title ?? resolvedAriaLabel,
    trailing: props.trailing,
    buttonProps: {
      type: 'button' as const,
      onClick: props.onClick,
      disabled: props.disabled,
      title: props.title ?? resolvedAriaLabel,
      'aria-label': resolvedAriaLabel,
      'data-ui': props.dataUi ?? 'shared.ui.popup-action-button',
      className: classNames.join(' '),
    },
  };
}

export function PopupActionButtonCompact(props: PopupActionButtonVariantProps) {
  const accessibleLabel =
    props.ariaLabel ?? props.title ?? (typeof props.label === 'string' ? props.label : undefined);

  return renderPopupActionButtonFrame({
    classNames: [
      COMPACT_BUTTON_CLASS_NAME,
      COMPACT_BUTTON_SURFACE_CLASS_NAME,
      COMPACT_BUTTON_INTERACTION_CLASS_NAME,
      props.rootClassName,
    ],
    content: (
      <PopupActionButtonCompactContent
        trailing={props.trailing}
        {...(accessibleLabel === undefined ? {} : { accessibleLabel })}
      />
    ),
    props,
  });
}

function renderDefaultContent(props: PopupActionButtonVariantProps) {
  return (
    <span
      className={
        props.centered
          ? [
              'flex min-w-0 flex-none items-center justify-between gap-2.5',
              'transition-transform duration-100 group-[:enabled:active]:translate-y-px',
              'motion-reduce:group-[:enabled:active]:translate-y-0 motion-reduce:transition-none',
            ].join(' ')
          : [
              'flex min-w-0 flex-1 items-center justify-between gap-2.5',
              'transition-transform duration-100 group-[:enabled:active]:translate-y-px',
              'motion-reduce:group-[:enabled:active]:translate-y-0 motion-reduce:transition-none',
            ].join(' ')
      }
    >
      <PopupActionButtonDefaultContent
        label={props.label}
        subtitle={props.subtitle}
        trailing={props.trailing}
      />
    </span>
  );
}

export function PopupActionButtonDefault(props: PopupActionButtonVariantProps) {
  return renderPopupActionButtonFrame({
    classNames: [
      DEFAULT_BUTTON_CLASS_NAME,
      DEFAULT_BUTTON_SURFACE_CLASS_NAME,
      DEFAULT_BUTTON_INTERACTION_CLASS_NAME,
      props.centered ? 'justify-center' : 'justify-start',
      props.rootClassName,
    ],
    content: renderDefaultContent(props),
    props,
  });
}
