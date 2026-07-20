type MenuType = 'capture' | 'timer' | 'viewport';

export function toggleToolbarMenu(
  isOpen: boolean,
  menuType: MenuType,
  closeMenus: (except?: MenuType | null) => void,
  setIsOpen: (next: boolean) => void
) {
  const next = !isOpen;
  closeMenus(next ? menuType : null);
  setIsOpen(next);
}
