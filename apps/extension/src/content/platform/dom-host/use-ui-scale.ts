import { useSyncExternalStore } from 'react';
import { getContentUiScaleSnapshot, subscribeContentUiScale } from './ui-scale';

export function useContentUiScale(): number {
  return useSyncExternalStore(subscribeContentUiScale, getContentUiScaleSnapshot, () => 1);
}
