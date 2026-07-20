import { useMemo, useRef, useState } from 'react';
import { resolveColorSelectorDisplayValue } from './helpers';
import { useColorSelectorOptions } from './state-options';
import {
  getNextColorSelectorFormatMode,
  type ColorSelectorFormatMode,
  type CompactColorSelectorProps,
} from './types';
import { useColorSelectorLifecycle } from './lifecycle';
import { usePickerInteractionState, usePickerRollback } from './picker-actions';

type UseColorSelectorStateArgs = {
  onChange: CompactColorSelectorProps['onChange'];
  onPreviewChange: CompactColorSelectorProps['onPreviewChange'] | undefined;
  onPreviewReset: CompactColorSelectorProps['onPreviewReset'] | undefined;
  palette: readonly string[] | undefined;
  recentColors: readonly string[] | undefined;
  value: string;
};

function useColorSelectorBaseState(value: string) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const eyedropperActiveRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [formatMode, setFormatMode] = useState<ColorSelectorFormatMode>('hex');
  const [pickerOpen, setPickerOpen] = useState(false);
  const committedColor = useMemo(() => resolveColorSelectorDisplayValue(value), [value]);
  const [draftColor, setDraftColor] = useState(committedColor);
  return {
    committedColor,
    draftColor,
    expanded,
    eyedropperActiveRef,
    formatMode,
    layerRef,
    pickerOpen,
    rootRef,
    setFormatMode,
    setDraftColor,
    setExpanded,
    setEyedropperActive: (active: boolean) => {
      eyedropperActiveRef.current = active;
    },
    setPickerOpen,
  };
}

export function useColorSelectorState(args: UseColorSelectorStateArgs) {
  const state = useColorSelectorBaseState(args.value);
  const options = useColorSelectorOptions(args.palette, args.recentColors);
  const pickerRollback = usePickerRollback({
    onPreviewReset: args.onPreviewReset,
    setDraftColor: state.setDraftColor,
    setPickerOpen: state.setPickerOpen,
  });
  const pickerInteractions = usePickerInteractionState({
    committedColor: state.committedColor,
    draftColor: state.draftColor,
    onChange: args.onChange,
    onPreviewChange: args.onPreviewChange,
    pickerOpen: state.pickerOpen,
    pickerRollback,
    setDraftColor: state.setDraftColor,
    setExpanded: state.setExpanded,
  });
  useColorSelectorLifecycle({
    committedColor: state.committedColor,
    expanded: state.expanded,
    eyedropperActiveRef: state.eyedropperActiveRef,
    layerRef: state.layerRef,
    onPickerOutsideDismiss: pickerRollback.rollbackPickerPreview,
    pickerOpen: state.pickerOpen,
    rootRef: state.rootRef,
    setDraftColor: state.setDraftColor,
    setExpanded: state.setExpanded,
  });

  return {
    committedColor: state.committedColor,
    draftColor: state.draftColor,
    expanded: state.expanded,
    formatMode: state.formatMode,
    layerRef: state.layerRef,
    pickerOpen: state.pickerOpen,
    rootRef: state.rootRef,
    setEyedropperActive: state.setEyedropperActive,
    cycleFormatMode: () => {
      state.setFormatMode((currentMode) => getNextColorSelectorFormatMode(currentMode));
    },
    ...pickerInteractions,
    ...options,
  };
}
