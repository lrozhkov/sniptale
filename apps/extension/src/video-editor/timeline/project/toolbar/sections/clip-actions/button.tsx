import type { JSX } from 'react';

import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { toolbarIconButtonClassName } from '../../constants';

type ProjectTimelineToolbarActionButtonProps = {
  danger?: boolean;
  disabled: boolean;
  icon: JSX.Element;
  label: string;
  onClick: () => void;
  title?: string;
};

export function ProjectTimelineToolbarActionButton({
  danger = false,
  disabled,
  icon,
  label,
  onClick,
  title,
}: ProjectTimelineToolbarActionButtonProps) {
  return (
    <ContentToolbarButton
      type="button"
      aria-label={label}
      className={toolbarIconButtonClassName}
      disabled={disabled}
      onClick={onClick}
      title={title}
      tone={danger ? 'danger' : 'default'}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </ContentToolbarButton>
  );
}
