import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { applyAppTheme, type ThemeTargetOptions } from '@sniptale/ui/theme/dom';
import { createThemePreferenceService, resolveAppTheme } from './preference-service';
import type { AppTheme, AppThemePreference } from '@sniptale/ui/theme/types';

const defaultThemeService = createLazyDefaultOwner(createThemePreferenceService);

export function getStoredThemePreference(): AppThemePreference | null {
  return defaultThemeService.getOwner().getStoredPreference();
}

export function applyScopedThemePreview(
  theme: AppTheme,
  target: HTMLElement | HTMLElement[] | null,
  options?: ThemeTargetOptions
): void {
  applyAppTheme(theme, target, options);
}

export async function setAppThemePreference(preference: AppThemePreference): Promise<AppTheme> {
  const resolvedTheme = resolveAppTheme(preference);
  await defaultThemeService.getOwner().setPreference(preference);
  applyAppTheme(resolvedTheme);
  return resolvedTheme;
}

export function initializeAppTheme(
  defaultPreference: AppThemePreference = 'system',
  target?: HTMLElement | HTMLElement[] | null,
  options?: ThemeTargetOptions
): () => void {
  const mediaQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  const applyStoredOrDefaultTheme = () => {
    const preference = defaultThemeService.getOwner().getStoredPreference() ?? defaultPreference;
    applyAppTheme(resolveAppTheme(preference), target, options);
  };

  const disposeThemeSubscription = defaultThemeService.getOwner().subscribe(() => {
    applyStoredOrDefaultTheme();
  });
  applyStoredOrDefaultTheme();
  void defaultThemeService
    .getOwner()
    .ensureHydrated()
    .then(() => {
      applyStoredOrDefaultTheme();
    })
    .catch(() => {
      applyStoredOrDefaultTheme();
    });

  const handleMediaQueryChange = () => {
    const preference = defaultThemeService.getOwner().getStoredPreference() ?? defaultPreference;
    if (preference === 'system') {
      applyStoredOrDefaultTheme();
    }
  };

  mediaQuery?.addEventListener('change', handleMediaQueryChange);

  return () => {
    disposeThemeSubscription();
    mediaQuery?.removeEventListener('change', handleMediaQueryChange);
  };
}
