import { useMemo } from 'react';

import { buildBorderPresetPreviewStyle } from '../state/helpers';
import { useBorderPresetDraftSetters } from './draft-setters';
import { useBorderPresetDraftState } from './draft-state';
import { useBorderPresetInitialization } from './initialization';
import { useBorderPresetResize } from './resize';
import { getBorderPresetCssValidation } from './validation';
import { useBorderPresetSaveHandler } from './save-handler';
import { useBorderPresetUpdatePadding } from './update-padding';
import type { BorderPresetEditorProps } from './types';

export function useBorderPresetEditorState({ isOpen, onSave, preset }: BorderPresetEditorProps) {
  const draft = useBorderPresetDraftState();
  const setters = useBorderPresetDraftSetters(draft);
  useBorderPresetInitialization(
    preset === undefined ? { isOpen, setters } : { isOpen, preset, setters }
  );

  const cssValidation = useMemo(
    () => getBorderPresetCssValidation(draft.customCss),
    [draft.customCss]
  );

  return {
    ...draft,
    cssError: cssValidation.cssError,
    handleResizeStart: useBorderPresetResize({ ...draft, isOpen }),
    handleSave: useBorderPresetSaveHandler(
      preset === undefined
        ? {
            cssValidation,
            draft,
            onSave,
          }
        : {
            cssValidation,
            draft,
            onSave,
            preset,
          }
    ),
    hasBlockedProps: cssValidation.hasBlockedProps,
    previewStyle: buildBorderPresetPreviewStyle(draft),
    updatePadding: useBorderPresetUpdatePadding(draft.setPadding),
  };
}

export type { BorderPresetEditorProps } from './types';
