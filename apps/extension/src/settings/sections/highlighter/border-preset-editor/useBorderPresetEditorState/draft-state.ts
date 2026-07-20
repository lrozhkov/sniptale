import type { BorderPresetDraftState } from './types';
import { useBorderPresetDraftSetters } from './draft-setters';
import { useBorderPresetDraftValues } from './draft-values';

export function useBorderPresetDraftState(): BorderPresetDraftState {
  const draft = useBorderPresetDraftValues();
  const setters = useBorderPresetDraftSetters(draft);

  return {
    ...draft,
    ...setters,
  };
}

export { useBorderPresetDraftSetters } from './draft-setters';
