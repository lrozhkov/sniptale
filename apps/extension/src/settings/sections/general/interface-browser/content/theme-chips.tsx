import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
        'flex w-full min-w-0 gap-1 rounded-[4px]',
        'bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
    >
      {state.themeOptions.map((option) => {
        const active =
          option.value === 'system'
            ? state.preference === 'system'
            : state.preference === option.value && state.resolvedTheme === option.value;

        return (
          <ProductActionButton
            tone="toggle"
            compact
            active={active}
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.label}
            onClick={() => state.setPreference(option.value)}
            className={[
              'min-w-0 flex-1 justify-center gap-1.5 px-2',
              'text-[13px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
              active
                ? 'bg-[var(--sniptale-color-surface-panel)] font-medium text-[var(--sniptale-color-text-primary)]'
                : [
                    'font-medium text-[var(--sniptale-color-text-muted)]',
                    'hover:text-[var(--sniptale-color-text-primary)]',
                  ].join(' '),
            ].join(' ')}
          >
            {themeIcons[option.value]}
            <span className="whitespace-normal">{option.label}</span>
          </ProductActionButton>
        );
      })}
    </div>
  );
}
