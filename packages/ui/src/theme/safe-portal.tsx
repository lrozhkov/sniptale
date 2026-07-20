import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { AppTheme } from './types';

const THEME_ATTRIBUTE = 'data-theme';
const DARK_THEME_CLASS_NAME = 'sniptale-theme-dark';

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark';
}

function resolveThemeOwner(source: Node | null): HTMLElement | null {
  if (typeof HTMLElement !== 'undefined' && source instanceof HTMLElement) {
    const owner = source.closest<HTMLElement>(`[${THEME_ATTRIBUTE}], .${DARK_THEME_CLASS_NAME}`);
    if (owner) {
      return owner;
    }
  }

  const root = source?.getRootNode?.();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    return resolveThemeOwner(root.host);
  }

  const ownerDocument =
    source?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!ownerDocument) {
    return null;
  }

  if (ownerDocument.body?.hasAttribute(THEME_ATTRIBUTE)) {
    return ownerDocument.body;
  }

  if (ownerDocument.documentElement?.hasAttribute(THEME_ATTRIBUTE)) {
    return ownerDocument.documentElement;
  }

  return null;
}

export function resolveThemeSafePortalTarget(
  anchorEl: HTMLElement | null
): ShadowRoot | DocumentFragment | HTMLElement {
  const portalTarget = anchorEl?.getRootNode();
  if (portalTarget instanceof ShadowRoot || portalTarget instanceof DocumentFragment) {
    return portalTarget;
  }

  return document.body;
}

export function resolvePortalTheme(source: Node | null): AppTheme | null {
  const themeOwner = resolveThemeOwner(source);
  if (!themeOwner) {
    return null;
  }

  const theme = themeOwner.getAttribute(THEME_ATTRIBUTE);
  if (isAppTheme(theme)) {
    return theme;
  }

  return themeOwner.classList.contains(DARK_THEME_CLASS_NAME) ? 'dark' : null;
}

export function useResolvedPortalTheme(source: Node | null): AppTheme | null {
  const [theme, setTheme] = useState<AppTheme | null>(() => resolvePortalTheme(source));

  useEffect(() => {
    const themeOwner = resolveThemeOwner(source);
    setTheme(resolvePortalTheme(source));

    if (!themeOwner || typeof MutationObserver === 'undefined') {
      return;
    }

    const observer = new MutationObserver(() => {
      setTheme(resolvePortalTheme(source));
    });

    observer.observe(themeOwner, {
      attributes: true,
      attributeFilter: [THEME_ATTRIBUTE],
    });

    return () => {
      observer.disconnect();
    };
  }, [source]);

  return theme;
}

export function mergeThemeScopedStyle(
  theme: AppTheme | null,
  style?: CSSProperties
): CSSProperties | undefined {
  if (!theme) {
    return style;
  }

  return {
    ...style,
    colorScheme: theme,
  };
}
