import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import {
  createUserCalloutPreset,
  updateCalloutPreset,
} from '../../../composition/persistence/callout-presets';
import { translate } from '../../../platform/i18n';

type SaveMutationState = {
  sessionGenerationRef: MutableRefObject<number>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
};

async function runPresetSave<T>(args: {
  command: (input: T) => Promise<{ outcome: string }>;
  errorMessage: string;
  input: T;
  state: SaveMutationState;
}) {
  const sessionId = args.state.sessionGenerationRef.current;
  args.state.setIsSaving(true);
  args.state.setError(null);
  try {
    const result = await args.command(args.input);
    if (sessionId !== args.state.sessionGenerationRef.current) return null;
    if (result.outcome === 'rejected') {
      args.state.setError(args.errorMessage);
      return null;
    }
    return result;
  } catch {
    if (sessionId === args.state.sessionGenerationRef.current) {
      args.state.setError(args.errorMessage);
    }
    return null;
  } finally {
    if (sessionId === args.state.sessionGenerationRef.current) args.state.setIsSaving(false);
  }
}

export function useCalloutPresetSaveMutations(state: SaveMutationState) {
  const create = useCallback(
    (input: Parameters<typeof createUserCalloutPreset>[0]) =>
      runPresetSave({
        command: createUserCalloutPreset,
        errorMessage: translate('content.callout.presetCreateError'),
        input,
        state,
      }),
    [state]
  );
  const overwrite = useCallback(
    (input: Parameters<typeof updateCalloutPreset>[0]) =>
      runPresetSave({
        command: updateCalloutPreset,
        errorMessage: translate('content.callout.presetUpdateError'),
        input,
        state,
      }),
    [state]
  );
  return { create, overwrite };
}
