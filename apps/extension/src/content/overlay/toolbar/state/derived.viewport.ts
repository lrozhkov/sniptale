import { useState } from 'react';

export function useToolbarViewportState(params: {
  propViewport?: { width: number; height: number } | null;
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
}) {
  const [localViewport, setLocalViewport] = useState<{ width: number; height: number } | null>(
    null
  );

  return {
    currentViewport: params.propViewport !== undefined ? params.propViewport : localViewport,
    setCurrentViewport: params.onViewportChange || setLocalViewport,
  };
}
