import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { translate } from '../../../platform/i18n';
import {
  getStoredThemePreference,
  resolveAppTheme,
  setAppThemePreference,
  type AppTheme,
  type AppThemePreference,
} from '../../theme/index';

const logger = createLogger({ namespace: 'shared:ui:popup-footer' });

function resolveFooterTheme(): AppTheme {
  const preference = getStoredThemePreference() ?? 'system';

  return resolveAppTheme(preference);
}

function getFooterThemeButtonClassName() {
  return [
    'inline-flex h-7 w-7 items-center justify-center rounded-full border-none transition-colors',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,transparent)]',
    'text-[var(--sniptale-color-accent)]',
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_96%,transparent)]',
    'hover:text-[var(--sniptale-color-text-primary)]',
  ].join(' ');
}

function getNextThemePreference(preference: AppThemePreference): AppThemePreference {
  if (preference === 'light') {
    return 'dark';
  }

  if (preference === 'dark') {
    return 'system';
  }

  return 'light';
}

function getThemePreferenceLabel(preference: AppThemePreference): string {
  if (preference === 'light') {
    return translate('popup.common.footerThemeLight');
  }

  if (preference === 'dark') {
    return translate('popup.common.footerThemeDark');
  }

  return translate('popup.common.footerThemeSystem');
}

function getThemeToggleTitle(preference: AppThemePreference): string {
  const nextPreference = getNextThemePreference(preference);
  return `${getThemePreferenceLabel(preference)} -> ${getThemePreferenceLabel(nextPreference)}`;
}

function getThemeToggleIcon(preference: AppThemePreference) {
  if (preference === 'light') {
    return Sun;
  }

  if (preference === 'dark') {
    return Moon;
  }

  return Monitor;
}

function usePopupFooterThemeState() {
  const [theme, setTheme] = useState<AppTheme>(() => resolveFooterTheme());
  const [preference, setPreference] = useState<AppThemePreference>(
    () => getStoredThemePreference() ?? 'system'
  );

  useEffect(() => {
    const updateTheme = () => {
      setPreference(getStoredThemePreference() ?? 'system');
      setTheme(resolveFooterTheme());
    };

    updateTheme();
    window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, updateTheme);

    return () => {
      window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, updateTheme);
    };
  }, []);

  return {
    preference,
    setNextPreference: (nextPreference: AppThemePreference) => {
      void setAppThemePreference(nextPreference)
        .then((nextTheme) => {
          setPreference(nextPreference);
          setTheme(nextTheme);
        })
        .catch((error) => {
          logger.error('Failed to persist popup footer theme preference', error);
        });
    },
    theme,
  };
}

export function PopupFooterThemeToggle() {
  const { preference, setNextPreference, theme } = usePopupFooterThemeState();
  const nextPreference = getNextThemePreference(preference);
  const ThemeIcon = getThemeToggleIcon(preference);

  return (
    <div
      role="group"
      aria-label={translate('popup.common.footerThemeToggleAria')}
      className={[
        [
          'inline-flex h-8 items-center rounded-full',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
        ].join(' '),
        'p-0.5 shadow-none',
      ].join(' ')}
    >
      <button
        type="button"
        title={getThemeToggleTitle(preference)}
        aria-label={translate('popup.common.footerThemeToggleAria')}
        data-theme-preference={preference}
        data-resolved-theme={theme}
        onClick={() => setNextPreference(nextPreference)}
        className={getFooterThemeButtonClassName()}
      >
        <ThemeIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
