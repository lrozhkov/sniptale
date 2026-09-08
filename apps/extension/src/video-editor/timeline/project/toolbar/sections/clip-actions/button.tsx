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
      className={[
        toolbarIconButtonClassName,
        '@min-[1600px]/timeline:!w-auto @min-[1600px]/timeline:!gap-2 @min-[1600px]/timeline:!px-2.5',
      ].join(' ')}
      disabled={disabled}
      onClick={onClick}
      title={title}
      tone={danger ? 'danger' : 'default'}
    >
      {icon}
      <span className="sr-only @min-[1600px]/timeline:not-sr-only @min-[1600px]/timeline:text-[13px]">
        {label}
      </span>
    </ContentToolbarButton>
  );
}
