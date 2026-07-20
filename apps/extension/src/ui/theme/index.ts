export type { AppTheme, AppThemePreference } from '@sniptale/ui/theme/types';
export { resolveAppTheme } from './preference-service';
export {
  applyScopedThemePreview,
  getStoredThemePreference,
  initializeAppTheme,
  setAppThemePreference,
} from './runtime';
