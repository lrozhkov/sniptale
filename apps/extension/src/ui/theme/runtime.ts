import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { applyAppTheme, type ThemeTargetOptions } from '@sniptale/ui/theme/dom';
import {
  createThemePreferenceService,
  readThemePaintHint,
  reconcileThemePaintHint,
} from './preference-service';
import { resolveAppTheme } from './paint-hint';
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
  await defaultThemeService.getOwner().setPreference(preference);
  const authoritativePreference = (await reconcileThemePaintHint()) ?? 'system';
  const resolvedTheme = resolveAppTheme(authoritativePreference);
  applyAppTheme(resolvedTheme);
  return resolvedTheme;
}

function initializeThemeRuntime(
  initialPreference: AppThemePreference,
  reconcilePaintHint: boolean,
  defaultPreference: AppThemePreference = 'system',
  target?: HTMLElement | HTMLElement[] | null,
  options?: ThemeTargetOptions
): () => void {
  const mediaQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  let activePreference = initialPreference;
  let reconciliationIntent = 0;
  let disposed = false;
  const applyPreference = (preference: AppThemePreference) => {
    activePreference = preference;
    applyAppTheme(resolveAppTheme(preference), target, options);
  };
  const applyStoredPreference = (preference: AppThemePreference | null) => {
    if (!reconcilePaintHint) {
      applyPreference(preference ?? defaultPreference);
      return;
    }

    const intent = ++reconciliationIntent;
    void reconcileThemePaintHint()
      .then((authoritativePreference) => {
        if (!disposed && intent === reconciliationIntent) {
          applyPreference(authoritativePreference ?? defaultPreference);
        }
      })
      .catch(() => {
        if (!disposed && intent === reconciliationIntent) {
          applyPreference(preference ?? defaultPreference);
        }
      });
  };

  const disposeThemeSubscription = defaultThemeService.getOwner().subscribe(applyStoredPreference);
  applyPreference(initialPreference);
  void defaultThemeService
    .getOwner()
    .ensureHydrated()
    .catch(() => {
      applyPreference(activePreference);
    });

  const handleMediaQueryChange = () => {
    if (activePreference === 'system') applyPreference(activePreference);
  };

  mediaQuery?.addEventListener('change', handleMediaQueryChange);

  return () => {
    disposed = true;
    reconciliationIntent += 1;
    disposeThemeSubscription();
    mediaQuery?.removeEventListener('change', handleMediaQueryChange);
  };
}

export function initializeAppTheme(
  defaultPreference: AppThemePreference = 'system',
  target?: HTMLElement | HTMLElement[] | null,
  options?: ThemeTargetOptions
): () => void {
  return initializeThemeRuntime(
    defaultThemeService.getOwner().getStoredPreference() ?? defaultPreference,
    false,
    defaultPreference,
    target,
    options
  );
}

export function initializeExtensionPageTheme(
  defaultPreference: AppThemePreference = 'system'
): () => void {
  return initializeThemeRuntime(readThemePaintHint() ?? defaultPreference, true, defaultPreference);
}
