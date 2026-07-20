import { getPopupActionButtonRootClassName } from './styles';
import type { PopupActionButtonProps } from './types';
import { PopupActionButtonCompact, PopupActionButtonDefault } from './variants';

export type { PopupActionButtonProps, PopupActionButtonTone } from './types';

function buildPopupActionButtonVariantProps(args: {
  ariaLabel?: string;
  dataUi?: string;
  disabled: boolean;
  icon: PopupActionButtonProps['icon'];
  iconClassName: string;
  label: PopupActionButtonProps['label'];
  onClick: () => void;
  rootClassName: string;
  subtitle?: PopupActionButtonProps['subtitle'];
  title?: string;
  trailing?: PopupActionButtonProps['trailing'];
}) {
  return {
    icon: args.icon,
    label: args.label,
    subtitle: args.subtitle,
    iconClassName: args.iconClassName,
    disabled: args.disabled,
    onClick: args.onClick,
    trailing: args.trailing,
    rootClassName: args.rootClassName,
    ...(args.ariaLabel === undefined ? {} : { ariaLabel: args.ariaLabel }),
    ...(args.title === undefined ? {} : { title: args.title }),
    ...(args.dataUi === undefined ? {} : { dataUi: args.dataUi }),
  };
}

export function PopupActionButton({
  icon: Icon,
  label,
  subtitle,
  ariaLabel,
  iconClassName,
  tone = 'secondary',
  disabled = false,
  title,
  onClick,
  trailing,
  compact = false,
  dataUi,
}: PopupActionButtonProps) {
  const rootClassName = getPopupActionButtonRootClassName(tone, disabled);
  const variantProps = buildPopupActionButtonVariantProps({
    disabled,
    icon: Icon,
    iconClassName,
    label,
    onClick,
    rootClassName,
    ...(ariaLabel === undefined ? {} : { ariaLabel }),
    ...(dataUi === undefined ? {} : { dataUi }),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(title === undefined ? {} : { title }),
    ...(trailing === undefined ? {} : { trailing }),
  });

  if (compact) {
    return <PopupActionButtonCompact {...variantProps} />;
  }

  return <PopupActionButtonDefault {...variantProps} />;
}
