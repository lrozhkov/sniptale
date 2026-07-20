import type { AppTheme } from './types';

const THEME_ATTRIBUTE = 'data-theme';

export interface ThemeTargetOptions {
  applyColorSchemeInline?: boolean;
}

function normalizeThemeTargets(target?: HTMLElement | HTMLElement[] | null): HTMLElement[] {
  if (typeof document === 'undefined') {
    return [];
  }

  if (!target) {
    return [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
  }

  return Array.isArray(target) ? target : [target];
}

function shouldApplyColorSchemeInline(options?: ThemeTargetOptions): boolean {
  return options?.applyColorSchemeInline ?? true;
}

export function applyAppTheme(
  theme: AppTheme,
  target?: HTMLElement | HTMLElement[] | null,
  options?: ThemeTargetOptions
): void {
  const targets = normalizeThemeTargets(target);
  if (targets.length === 0) {
    return;
  }

  const applyColorSchemeInline = shouldApplyColorSchemeInline(options);
  for (const element of targets) {
    element.setAttribute(THEME_ATTRIBUTE, theme);
    if (applyColorSchemeInline) {
      element.style.colorScheme = theme;
      continue;
    }

    element.style.removeProperty('color-scheme');
  }
}
