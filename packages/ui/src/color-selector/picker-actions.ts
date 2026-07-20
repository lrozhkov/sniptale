import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { COLOR_SELECTOR_TRANSPARENT } from './helpers';

type PickerRollback = ReturnType<typeof usePickerRollback>;

function usePreviewResetRef(onPreviewReset: ((value: string) => void) | undefined) {
  const previewResetRef = useRef(onPreviewReset);

  useEffect(() => {
    previewResetRef.current = onPreviewReset;
  }, [onPreviewReset]);

  return previewResetRef;
}

function usePickerOriginCleanup(args: {
  onPreviewReset: ((value: string) => void) | undefined;
  pickerOriginRef: MutableRefObject<string | null>;
}) {
  const { pickerOriginRef } = args;
  const previewResetRef = usePreviewResetRef(args.onPreviewReset);

  useEffect(() => {
    const pickerOrigin = pickerOriginRef;
    const previewReset = previewResetRef;
    return () => {
      const origin = pickerOrigin.current;
      if (!origin) {
        return;
      }

      pickerOrigin.current = null;
      previewReset.current?.(origin);
    };
  }, [pickerOriginRef, previewResetRef]);

  return previewResetRef;
}

export function usePickerRollback(args: {
  onPreviewReset: ((value: string) => void) | undefined;
  setDraftColor: Dispatch<SetStateAction<string>>;
  setPickerOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { onPreviewReset, setDraftColor, setPickerOpen } = args;
  const pickerOriginRef = useRef<string | null>(null);
  const previewResetRef = usePickerOriginCleanup({ onPreviewReset, pickerOriginRef });

  return {
    clearPickerOrigin: useCallback(() => {
      pickerOriginRef.current = null;
      setPickerOpen(false);
    }, [setPickerOpen]),
    openPicker: useCallback(
      (committedColor: string) => {
        pickerOriginRef.current = committedColor;
        setDraftColor(committedColor);
        setPickerOpen(true);
      },
      [setDraftColor, setPickerOpen]
    ),
    rollbackPickerPreview: useCallback(() => {
      const pickerOrigin = pickerOriginRef.current;
      pickerOriginRef.current = null;
      setPickerOpen(false);
      if (!pickerOrigin) {
        return;
      }

      setDraftColor(pickerOrigin);
      previewResetRef.current?.(pickerOrigin);
    }, [previewResetRef, setDraftColor, setPickerOpen]),
  };
}

function useCommitSelectionHandlers(args: {
  clearPickerOrigin: () => void;
  draftColor: string;
  onChange: (value: string) => void;
  onPreviewChange: ((value: string) => void) | undefined;
  setDraftColor: Dispatch<SetStateAction<string>>;
}) {
  const { clearPickerOrigin, draftColor, onChange, onPreviewChange, setDraftColor } = args;

  return {
    handlePickerApply: useCallback(() => {
      clearPickerOrigin();
      onChange(draftColor);
    }, [clearPickerOrigin, draftColor, onChange]),
    handleSelectTransparent: useCallback(() => {
      setDraftColor(COLOR_SELECTOR_TRANSPARENT);
      onPreviewChange?.(COLOR_SELECTOR_TRANSPARENT);
    }, [onPreviewChange, setDraftColor]),
    handleSwatchSelect: useCallback(
      (nextColor: string) => {
        setDraftColor(nextColor);
        onChange(nextColor);
      },
      [onChange, setDraftColor]
    ),
  };
}

function useDraftColorChange(args: {
  onPreviewChange: ((value: string) => void) | undefined;
  setDraftColor: Dispatch<SetStateAction<string>>;
}) {
  const { onPreviewChange, setDraftColor } = args;
  return useCallback(
    (nextColor: string) => {
      setDraftColor(nextColor);
      onPreviewChange?.(nextColor);
    },
    [onPreviewChange, setDraftColor]
  );
}

function useOpenPickerAction(args: {
  committedColor: string;
  openPicker: (committedColor: string) => void;
  pickerOpen: boolean;
  rollbackPickerPreview: () => void;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const { committedColor, openPicker, pickerOpen, rollbackPickerPreview, setExpanded } = args;

  return useCallback(() => {
    if (pickerOpen) {
      rollbackPickerPreview();
      return;
    }

    setExpanded(false);
    openPicker(committedColor);
  }, [committedColor, openPicker, pickerOpen, rollbackPickerPreview, setExpanded]);
}

function usePickerActionHandlers(args: {
  clearPickerOrigin: () => void;
  committedColor: string;
  draftColor: string;
  onChange: (value: string) => void;
  onPreviewChange: ((value: string) => void) | undefined;
  openPicker: (committedColor: string) => void;
  pickerOpen: boolean;
  rollbackPickerPreview: () => void;
  setDraftColor: Dispatch<SetStateAction<string>>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const commitHandlers = useCommitSelectionHandlers(args);

  return {
    handleDraftColorChange: useDraftColorChange(args),
    handleOpenPicker: useOpenPickerAction(args),
    ...commitHandlers,
  };
}

function useExpandedAction(
  pickerOpen: boolean,
  rollbackPickerPreview: () => void,
  setExpanded: Dispatch<SetStateAction<boolean>>
) {
  return useCallback(() => {
    if (pickerOpen) {
      rollbackPickerPreview();
      return;
    }

    setExpanded((state) => !state);
  }, [pickerOpen, rollbackPickerPreview, setExpanded]);
}

export function usePickerInteractionState(args: {
  committedColor: string;
  draftColor: string;
  onChange: (value: string) => void;
  onPreviewChange: ((value: string) => void) | undefined;
  pickerOpen: boolean;
  pickerRollback: PickerRollback;
  setDraftColor: Dispatch<SetStateAction<string>>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const pickerActions = usePickerActionHandlers({
    clearPickerOrigin: args.pickerRollback.clearPickerOrigin,
    committedColor: args.committedColor,
    draftColor: args.draftColor,
    onChange: args.onChange,
    onPreviewChange: args.onPreviewChange,
    openPicker: args.pickerRollback.openPicker,
    pickerOpen: args.pickerOpen,
    rollbackPickerPreview: args.pickerRollback.rollbackPickerPreview,
    setDraftColor: args.setDraftColor,
    setExpanded: args.setExpanded,
  });

  return {
    handlePickerCancel: args.pickerRollback.rollbackPickerPreview,
    handleToggleExpanded: useExpandedAction(
      args.pickerOpen,
      args.pickerRollback.rollbackPickerPreview,
      args.setExpanded
    ),
    ...pickerActions,
  };
}
