import { Monitor, MoonStar, SunMedium } from 'lucide-react';
import type { ReactNode } from 'react';

import { translate } from '../../../../platform/i18n';
import { getControlSegmentedOptionClassName } from '@sniptale/ui/control-language';

import type { AppearanceSectionState } from './types';
import {
  ACTIVE_THEME_BACKGROUND_CLASS_NAME,
  IDLE_THEME_BACKGROUND_CLASS_NAME,
} from './styles.constants';

function ThemeModeButton(props: {
  active: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'flex flex-col items-start gap-3 text-left transition-colors',
        getControlSegmentedOptionClassName({
          active: props.active,
          density: 'default',
          layout: 'tile',
        }),
        props.active
          ? [
              'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]',
              ACTIVE_THEME_BACKGROUND_CLASS_NAME,
            ].join(' ')
          : [
              IDLE_THEME_BACKGROUND_CLASS_NAME,
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
            ].join(' '),
      ].join(' ')}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {props.icon}
        {props.label}
      </span>
      <span className="text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
        {props.description}
      </span>
    </button>
  );
}

export function ThemeChips({ state }: { state: AppearanceSectionState }) {
  const themeIcons = {
    dark: <MoonStar className="h-4 w-4" />,
    light: <SunMedium className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  } as const;

  return (
    <div
      role="group"
      aria-label={translate('settings.appearance.themeModeLabel', state.locale)}
      className="grid gap-3 md:grid-cols-3"
    >
      {state.themeOptions.map((option) => {
        const active =
          option.value === 'system'
            ? state.preference === 'system'
            : state.preference === option.value && state.resolvedTheme === option.value;

        return (
          <ThemeModeButton
            key={option.value}
            active={active}
            description={option.description}
            icon={themeIcons[option.value]}
            label={option.label}
            onClick={() => state.setPreference(option.value)}
          />
        );
      })}
    </div>
  );
}
