import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyScopedThemePreview,
  getStoredThemePreference,
  resolveAppTheme,
  type AppTheme,
} from '../../ui/theme';

interface DesignSystemThemeContextValue {
  previewTheme: AppTheme;
  setPreviewTheme: (theme: AppTheme) => void;
}

const DesignSystemThemeContext = createContext<DesignSystemThemeContextValue | null>(null);

export function DesignSystemThemeSurface({ children }: { children: ReactNode }) {
  const [previewTheme, setPreviewTheme] = useState<AppTheme>(() => {
    const storedPreference = getStoredThemePreference() ?? 'system';
    return resolveAppTheme(storedPreference);
  });
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!surfaceRef.current) {
      return;
    }

    applyScopedThemePreview(previewTheme, surfaceRef.current);
  }, [previewTheme]);

  const contextValue = useMemo<DesignSystemThemeContextValue>(
    () => ({
      previewTheme,
      setPreviewTheme,
    }),
    [previewTheme]
  );

  return (
    <DesignSystemThemeContext.Provider value={contextValue}>
      <div
        ref={surfaceRef}
        data-ui="design-system.theme-surface"
        className="min-h-screen bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]"
      >
        {children}
      </div>
    </DesignSystemThemeContext.Provider>
  );
}

export function useDesignSystemThemeSurface(): DesignSystemThemeContextValue {
  const context = useContext(DesignSystemThemeContext);
  if (!context) {
    throw new Error('useDesignSystemThemeSurface must be used within DesignSystemThemeSurface');
  }

  return context;
}
