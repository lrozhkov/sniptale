import { normalizePaintColor } from '@sniptale/foundation/paint';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import type { QuickEditUiState } from '../../features/video/review/advanced/types';

/** Disposable picker preview follows the resolved theme; only Apply reaches the UI writer. */
export function useReviewWorkspaceColor(
  container: RefObject<HTMLDivElement | null>,
  colors: QuickEditUiState['workspaceColors'],
  change: (theme: 'light' | 'dark', color: string | null) => void,
  ready = true
) {
  const theme = useResolvedPortalTheme(container.current);
  const saved = theme ? colors?.[theme] : undefined;
  const [automatic, setAutomatic] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    theme: typeof theme;
    base: string | undefined;
    color: string;
  } | null>(null);
  useLayoutEffect(() => {
    if (!ready) return;
    const node = container.current;
    setAutomatic(
      node
        ? normalizePaintColor(
            getComputedStyle(node).getPropertyValue('--sniptale-color-surface-canvas').trim()
          )
        : null
    );
    setPreview(null);
  }, [container, theme, ready]);
  const style: CSSProperties & { '--sniptale-review-workspace-color'?: string | undefined } = {
    '--sniptale-review-workspace-color':
      preview?.theme === theme && preview.base === saved ? preview.color : saved,
  };
  return {
    theme,
    value: saved ?? automatic,
    style,
    preview(color: string) {
      const normalized = normalizePaintColor(color);
      if (theme && normalized) setPreview({ theme, base: saved, color: normalized });
    },
    cancel() {
      setPreview(null);
    },
    change(color: string) {
      const normalized = normalizePaintColor(color);
      setPreview(null);
      if (theme && normalized) change(theme, normalized);
    },
    reset() {
      setPreview(null);
      if (theme && saved !== undefined) change(theme, null);
    },
  };
}
