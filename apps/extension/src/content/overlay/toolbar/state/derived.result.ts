import type { useToolbarNavigationLock } from '../shell/navigation-lock';
import type { useToolbarRefsAndPosition } from './refs-and-position';

export function createToolbarDerivedStateResult(params: {
  currentViewport: { width: number; height: number } | null;
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  refsAndPosition: ReturnType<typeof useToolbarRefsAndPosition>;
  navigation: ReturnType<typeof useToolbarNavigationLock>;
}) {
  return {
    currentViewport: params.currentViewport,
    setCurrentViewport: params.setCurrentViewport,
    isLoading: params.isLoading,
    setIsLoading: params.setIsLoading,
    ...params.refsAndPosition,
    ...params.navigation,
  };
}
