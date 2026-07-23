import type React from 'react';
import { useEffect } from 'react';
import { isContentEventWithinElement } from '../../../../platform/dom-host';

export function useTemplateMenuDismiss(
  openMenuId: string | null,
  setOpenMenuId: (id: string | null) => void,
  menuRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!isContentEventWithinElement(event, menuRef.current)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [menuRef, openMenuId, setOpenMenuId]);
}
