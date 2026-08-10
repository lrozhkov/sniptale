import { Monitor, MoonStar, SunMedium } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';

import type { AppearanceSectionState } from './types';

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
      className={[
        'inline-flex w-full min-w-0 gap-1 rounded-lg p-1 sm:w-auto',
        'bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
    >
      {state.themeOptions.map((option) => {
        const active =
          option.value === 'system'
            ? state.preference === 'system'
            : state.preference === option.value && state.resolvedTheme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.label}
            onClick={() => state.setPreference(option.value)}
            className={[
              'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3',
              'text-xs transition-colors sm:flex-none',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
              active
                ? 'bg-[var(--sniptale-color-surface-panel)] font-semibold text-[var(--sniptale-color-text-primary)]'
                : [
                    'font-medium text-[var(--sniptale-color-text-muted)]',
                    'hover:text-[var(--sniptale-color-text-primary)]',
                  ].join(' '),
            ].join(' ')}
          >
            {themeIcons[option.value]}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
