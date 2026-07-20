import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef } from 'react';
import {
  isFloatingInteractionOutsideOwners,
  isOwnedFloatingInteractionEvent,
} from '../floating-interactions/target';

function useOutsideDismiss(args: {
  eyedropperActiveRef: RefObject<boolean>;
  expanded: boolean;
  layerRef: RefObject<HTMLDivElement | null>;
  onPickerOutsideDismiss: () => void;
  pickerOpen: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const { expanded, layerRef, pickerOpen, rootRef, setExpanded } = args;

  useEffect(() => {
    if (!expanded && !pickerOpen) {
      return;
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (args.eyedropperActiveRef.current) {
        return;
      }

      if (isOwnedFloatingInteractionEvent(event, [rootRef.current, layerRef.current])) {
        return;
      }

      if (
        pickerOpen &&
        isFloatingInteractionOutsideOwners(event, [rootRef.current, layerRef.current])
      ) {
        args.onPickerOutsideDismiss();
        return;
      }

      setExpanded(false);
    };

    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, [args, expanded, layerRef, pickerOpen, rootRef, setExpanded]);
}

function useExpandedEscapeDismiss(args: {
  expanded: boolean;
  pickerOpen: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const { expanded, pickerOpen, setExpanded } = args;

  useEffect(() => {
    if (!expanded || pickerOpen) {
      return;
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [expanded, pickerOpen, setExpanded]);
}

export function useColorSelectorLifecycle(args: {
  committedColor: string;
  expanded: boolean;
  eyedropperActiveRef: RefObject<boolean>;
  layerRef: RefObject<HTMLDivElement | null>;
  onPickerOutsideDismiss: () => void;
  pickerOpen: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  setDraftColor: Dispatch<SetStateAction<string>>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    committedColor,
    expanded,
    eyedropperActiveRef,
    layerRef,
    pickerOpen,
    rootRef,
    setDraftColor,
    setExpanded,
  } = args;

  useOutsideDismiss({
    eyedropperActiveRef,
    expanded,
    layerRef,
    onPickerOutsideDismiss: args.onPickerOutsideDismiss,
    pickerOpen,
    rootRef,
    setExpanded,
  });
  useExpandedEscapeDismiss({ expanded, pickerOpen, setExpanded });

  const previousCommittedColorRef = useRef(committedColor);

  useEffect(() => {
    if (pickerOpen || previousCommittedColorRef.current === committedColor) {
      return;
    }

    previousCommittedColorRef.current = committedColor;
    setDraftColor(committedColor);
  }, [committedColor, pickerOpen, setDraftColor]);
}
