import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';
import {
  resetSystemCalloutPreset,
  setCalloutPresetEnabled,
  updateCalloutPreset,
} from '../../../composition/persistence/callout-presets';
import { useCalloutPresetSaveMutations } from './preset-save-mutations';

type EditorState = { isOpen: boolean; preset?: CalloutPreset };

export function useCalloutPresetPopoverMutations(args: {
  sessionGenerationRef: MutableRefObject<number>;
  setEditor: Dispatch<SetStateAction<EditorState>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setPendingPresetIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const presetSave = useCalloutPresetSaveMutations(args);

  const toggle = useCallback(
    async (preset: CalloutPreset) => {
      const sessionId = args.sessionGenerationRef.current;
      args.setPendingPresetIds((current) => new Set(current).add(preset.id));
      try {
        const result = await setCalloutPresetEnabled(preset.id, preset.enabled === false);
        if (sessionId === args.sessionGenerationRef.current && result.outcome === 'rejected') {
          args.setError(translate('content.callout.presetToggleError'));
        }
      } catch {
        if (sessionId === args.sessionGenerationRef.current) {
          args.setError(translate('content.callout.presetToggleError'));
        }
      } finally {
        args.setPendingPresetIds((current) => {
          const next = new Set(current);
          next.delete(preset.id);
          return next;
        });
      }
    },
    [args]
  );

  const save = useCallback(
    async (preset: CalloutPreset) => {
      const sessionId = args.sessionGenerationRef.current;
      args.setIsSaving(true);
      try {
        const result = await updateCalloutPreset({
          content: preset.content,
          id: preset.id,
          name: preset.name,
          placement: preset.placement,
          style: preset.style,
        });
        if (sessionId !== args.sessionGenerationRef.current) return;
        if (result.outcome === 'rejected') {
          args.setError(translate('content.callout.presetUpdateError'));
          return;
        }
        args.setEditor({ isOpen: false });
      } catch {
        if (sessionId === args.sessionGenerationRef.current) {
          args.setError(translate('content.callout.presetUpdateError'));
        }
      } finally {
        if (sessionId === args.sessionGenerationRef.current) args.setIsSaving(false);
      }
    },
    [args]
  );

  const reset = useCallback(
    async (preset: CalloutPreset) => {
      if (preset.origin !== 'system' || preset.customized !== true) return;
      const sessionId = args.sessionGenerationRef.current;
      args.setPendingPresetIds((current) => new Set(current).add(preset.id));
      args.setIsSaving(true);
      try {
        const result = await resetSystemCalloutPreset(preset.id);
        if (sessionId !== args.sessionGenerationRef.current) return;
        if (result.outcome === 'rejected') {
          args.setError(translate('content.callout.presetUpdateError'));
          return;
        }
        args.setEditor({ isOpen: false });
      } catch {
        if (sessionId === args.sessionGenerationRef.current) {
          args.setError(translate('content.callout.presetUpdateError'));
        }
      } finally {
        if (sessionId === args.sessionGenerationRef.current) args.setIsSaving(false);
        args.setPendingPresetIds((current) => {
          const next = new Set(current);
          next.delete(preset.id);
          return next;
        });
      }
    },
    [args]
  );

  return { ...presetSave, reset, save, toggle };
}
