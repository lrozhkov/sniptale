import type { CompactSelectOption } from './select-types';

export interface CompactSelectActions<T extends string> {
  closeAndFocusTrigger: () => void;
  focusOption: (index: number) => void;
  openMenu: (preferredIndex?: number) => void;
  selectOption: (option: CompactSelectOption<T>) => void;
  selectedIndex: number;
}
