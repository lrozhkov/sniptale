export type { AppTheme, AppThemePreference } from '@sniptale/ui/theme/types';
export { resolveAppTheme } from './paint-hint';
export {
  applyScopedThemePreview,
  getStoredThemePreference,
  initializeAppTheme,
  initializeExtensionPageTheme,
  setAppThemePreference,
} from './runtime';
