import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { InspectorGroupDefinition } from './types';

export interface InspectorGroupHeaderSlot {
  activeGroupId: string;
  ariaLabel: string;
  groups: readonly InspectorGroupDefinition<string>[];
  onChange: (groupId: string) => void;
}

export const InspectorGroupHeaderSlotContext = createContext<Dispatch<
  SetStateAction<InspectorGroupHeaderSlot | null>
> | null>(null);

export function useRegisterInspectorGroupHeaderSlot(
  slot: InspectorGroupHeaderSlot | null
): boolean {
  const setSlot = useContext(InspectorGroupHeaderSlotContext);
  const stableSlot = useStableInspectorGroupHeaderSlot(slot);

  useEffect(() => {
    if (!setSlot) {
      return undefined;
    }

    setSlot(stableSlot);
    return () => {
      setSlot((currentSlot) => (currentSlot === stableSlot ? null : currentSlot));
    };
  }, [setSlot, stableSlot]);

  return Boolean(setSlot);
}

function useStableInspectorGroupHeaderSlot(
  slot: InspectorGroupHeaderSlot | null
): InspectorGroupHeaderSlot | null {
  const stableSlotRef = useRef<InspectorGroupHeaderSlot | null>(null);

  if (!areInspectorGroupHeaderSlotsEqual(stableSlotRef.current, slot)) {
    stableSlotRef.current = slot;
  }

  return stableSlotRef.current;
}

function areInspectorGroupHeaderSlotsEqual(
  currentSlot: InspectorGroupHeaderSlot | null,
  nextSlot: InspectorGroupHeaderSlot | null
): boolean {
  if (currentSlot === nextSlot) {
    return true;
  }
  if (!currentSlot || !nextSlot) {
    return false;
  }
  if (
    currentSlot.activeGroupId !== nextSlot.activeGroupId ||
    currentSlot.ariaLabel !== nextSlot.ariaLabel ||
    currentSlot.groups.length !== nextSlot.groups.length
  ) {
    return false;
  }

  return currentSlot.groups.every((group, index) => {
    const nextGroup = nextSlot.groups[index];
    return nextGroup?.id === group.id && nextGroup.label === group.label;
  });
}
