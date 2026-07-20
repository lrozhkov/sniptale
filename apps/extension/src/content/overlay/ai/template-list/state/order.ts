import type React from 'react';
import { useEffect, useState } from 'react';
import { isContentEventWithinElement } from '../../../../platform/dom-host';
import type { PromptTemplate } from '../../../../../contracts/settings';
import { loadSavedTemplateOrder, syncOrderedIds } from './helpers';

export function useTemplateOrderState(templates: PromptTemplate[]) {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [orderLoaded, setOrderLoaded] = useState(false);

  useEffect(() => {
    void loadSavedTemplateOrder(setOrderedIds, setOrderLoaded);
  }, []);

  useEffect(() => {
    if (!orderLoaded) {
      return;
    }

    setOrderedIds((previous) => syncOrderedIds(previous, templates));
  }, [orderLoaded, templates]);

  return { orderedIds, setOrderedIds };
}

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
