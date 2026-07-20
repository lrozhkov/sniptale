import type { ElementType, ReactNode } from 'react';

import {
  settingsSectionDescriptionClassName,
  settingsSectionHeadingWrapClassName,
  settingsSectionKickerClassName,
  settingsSectionTitleClassName,
} from './classes';

type SettingsSectionHeaderProps = {
  title?: string;
  description?: string;
  kicker?: string;
  aside?: ReactNode;
  as?: ElementType;
};

export function SettingsSectionHeader({
  as,
  aside,
  description,
  kicker,
  title,
}: SettingsSectionHeaderProps) {
  const TitleTag = as ?? 'h1';

  return (
    <header className={settingsSectionHeadingWrapClassName}>
      <div className="min-w-0 space-y-2">
        {kicker ? <p className={settingsSectionKickerClassName}>{kicker}</p> : null}
        {title ? <TitleTag className={settingsSectionTitleClassName}>{title}</TitleTag> : null}
        {description ? <p className={settingsSectionDescriptionClassName}>{description}</p> : null}
      </div>
      {aside ? <div className="flex-shrink-0">{aside}</div> : null}
    </header>
  );
}
