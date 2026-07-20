import { useToolbarViewportStatus } from '../shell/viewport-status';

export function useToolbarDerivedEffects(params: {
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
}) {
  useToolbarViewportStatus({
    setCurrentViewport: params.setCurrentViewport,
  });
}
