import type { ComponentType, ReactNode } from 'react';
import {
  PopupActionButtonCompactContent,
  PopupActionButtonDefaultContent,
  PopupActionButtonIcon,
} from './content';

const COMPACT_BUTTON_CLASS_NAME =
  'relative flex h-12 min-h-12 w-full min-w-0 items-center justify-center overflow-hidden';

const COMPACT_BUTTON_SURFACE_CLASS_NAME = 'rounded-[12px] px-0 outline-none transition-all';

const DEFAULT_BUTTON_CLASS_NAME =
  'relative flex h-12 min-h-12 min-w-0 items-center justify-start gap-2 overflow-hidden';

const DEFAULT_BUTTON_SURFACE_CLASS_NAME =
  'rounded-[12px] px-3.5 text-[12px] font-medium leading-tight';

const DEFAULT_BUTTON_INTERACTION_CLASS_NAME =
  'group outline-none transition-all focus-visible:outline-none';

const COMPACT_BUTTON_INTERACTION_CLASS_NAME = 'group focus-visible:outline-none';

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
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2.5">
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
      props.rootClassName,
    ],
    content: renderDefaultContent(props),
    props,
  });
}
