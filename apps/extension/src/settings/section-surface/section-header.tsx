import {
  settingsSectionDescriptionClassName,
  settingsSectionHeadingWrapClassName,
  settingsSectionKickerClassName,
} from './classes';
import { SettingsSectionHeaderActionSlot } from './section-header-actions';

type SettingsSectionHeaderProps = {
  description: string;
  kicker: string;
};

export function SettingsSectionHeader({ description, kicker }: SettingsSectionHeaderProps) {
  return (
    <header className={settingsSectionHeadingWrapClassName}>
      <div className="min-w-0 space-y-2">
        <h1 className={settingsSectionKickerClassName}>{kicker}</h1>
        <p className={settingsSectionDescriptionClassName}>{description}</p>
      </div>
      <SettingsSectionHeaderActionSlot />
    </header>
  );
}
