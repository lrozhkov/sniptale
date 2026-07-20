import { useCallback } from 'react';

import type { BorderPadding } from '../../../../../features/highlighter/contracts';
import type { BorderPresetDraftSetters } from './types';

export function useBorderPresetUpdatePadding(setPadding: BorderPresetDraftSetters['setPadding']) {
  return useCallback(
    (key: keyof BorderPadding, value: number) => {
      setPadding((current) => ({ ...current, [key]: Math.max(0, Math.min(50, value)) }));
    },
    [setPadding]
  );
}
