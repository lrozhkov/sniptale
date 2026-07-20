import type { ComponentType, ReactNode } from 'react';

export type PopupActionButtonTone = 'primary' | 'secondary' | 'gallery';

export interface PopupActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  subtitle?: ReactNode;
  ariaLabel?: string;
  iconClassName: string;
  tone?: PopupActionButtonTone;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  trailing?: ReactNode;
  compact?: boolean;
  dataUi?: string;
}
