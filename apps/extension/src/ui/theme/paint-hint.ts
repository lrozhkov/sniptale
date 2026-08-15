import type { AppTheme, AppThemePreference } from '@sniptale/ui/theme/types';

export const THEME_STORAGE_KEY = 'sniptale-theme-preference';

function isThemePreference(value: unknown): value is AppThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function normalizeStoredThemePreference(value: unknown): AppThemePreference | null {
  return isThemePreference(value) ? value : null;
}

export function resolveAppTheme(preference: AppThemePreference = 'system'): AppTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
