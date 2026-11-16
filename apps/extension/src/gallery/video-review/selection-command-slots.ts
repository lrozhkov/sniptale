import { createContext } from 'react';

/** Shared action identities keep inspector commands in stable toolbar positions. */
export type ReviewSelectionCommand = 'duplicate' | 'reset' | 'delete';
export type ReviewSelectionCommandSlots = Partial<
  Record<ReviewSelectionCommand, HTMLSpanElement | null>
>;
export const ReviewSelectionCommandSlotsContext = createContext<ReviewSelectionCommandSlots | null>(
  null
);
