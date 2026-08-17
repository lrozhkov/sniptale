import type { CompactSelectOption } from './select-types';

export interface CompactSelectActions<T extends string> {
  closeAndFocusTrigger: () => void;
  focusOption: (index: number) => void;
  openMenu: (preferredIndex?: number, focusOption?: boolean) => void;
  selectOption: (option: CompactSelectOption<T>, restoreFocus?: boolean) => void;
  selectedIndex: number;
}
