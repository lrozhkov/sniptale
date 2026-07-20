import type { JSX } from 'react';

import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { toolbarButtonClassName } from '../../constants';

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
      className={toolbarButtonClassName}
      disabled={disabled}
      onClick={onClick}
      title={title}
      tone={danger ? 'danger' : 'default'}
    >
      {icon}
      <span>{label}</span>
    </ContentToolbarButton>
  );
}
