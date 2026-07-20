import { useEffect } from 'react';

export function useToolbarButtonFocusBlur(params: {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
  aiButtonRef: React.RefObject<HTMLButtonElement | null>;
  highlighterButtonRef: React.RefObject<HTMLButtonElement | null>;
  quickEditButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const {
    aiPickMode,
    highlighterButtonRef,
    highlighterMode,
    aiButtonRef,
    quickEditButtonRef,
    quickEditMode,
  } = params;

  useEffect(() => {
    if (!aiPickMode) {
      aiButtonRef.current?.blur();
    }
    if (!highlighterMode) {
      highlighterButtonRef.current?.blur();
    }
    if (!quickEditMode) {
      quickEditButtonRef.current?.blur();
    }
  }, [
    aiPickMode,
    aiButtonRef,
    highlighterButtonRef,
    highlighterMode,
    quickEditButtonRef,
    quickEditMode,
  ]);
}
