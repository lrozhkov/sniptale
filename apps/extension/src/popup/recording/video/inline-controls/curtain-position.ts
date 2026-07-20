import { useLayoutEffect, useState, type RefObject } from 'react';

export function useCurtainListPosition({
  activeOptionRef,
  anchorClientY,
  activeValue,
  firstOptionRef,
  listRef,
  panelRef,
  triggerRef,
}: {
  activeOptionRef: RefObject<HTMLButtonElement | null>;
  anchorClientY: number | null;
  activeValue: string;
  firstOptionRef: RefObject<HTMLButtonElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLDivElement | null>;
}): number {
  const [listOffsetTop, setListOffsetTop] = useState(0);

  useLayoutEffect(() => {
    let frame = 0;
    let lastPosition = { paddingTop: 0, scrollTop: 0 };
    const applyPosition = () => {
      const nextPosition = resolveCurtainListPosition({
        activeOption: activeOptionRef.current,
        anchorClientY,
        firstOption: firstOptionRef.current,
        list: listRef.current,
        panel: panelRef.current,
        trigger: triggerRef.current,
      });
      const stablePosition = stabilizeCurtainListPosition(lastPosition, nextPosition);
      lastPosition = stablePosition;
      setListOffsetTop(stablePosition.paddingTop);
      if (panelRef.current) {
        panelRef.current.scrollTop = stablePosition.scrollTop;
      }
    };

    applyPosition();
    frame = requestAnimationFrame(applyPosition);
    return () => cancelAnimationFrame(frame);
  }, [activeOptionRef, activeValue, anchorClientY, firstOptionRef, listRef, panelRef, triggerRef]);

  return listOffsetTop;
}

function stabilizeCurtainListPosition(
  previous: { paddingTop: number; scrollTop: number },
  next: { paddingTop: number; scrollTop: number }
): { paddingTop: number; scrollTop: number } {
  if (previous.paddingTop > 0 && next.paddingTop > 0 && next.paddingTop < previous.paddingTop) {
    return { paddingTop: previous.paddingTop, scrollTop: 0 };
  }

  return next;
}

export function resolveCurtainListPosition({
  activeOption,
  anchorClientY,
  firstOption,
  list,
  panel,
  trigger,
}: {
  activeOption: HTMLButtonElement | null;
  anchorClientY: number | null;
  firstOption: HTMLButtonElement | null;
  list: HTMLDivElement | null;
  panel: HTMLDivElement | null;
  trigger: HTMLDivElement | null;
}): { paddingTop: number; scrollTop: number } {
  const anchorOption = activeOption ?? firstOption;
  if (!panel || !trigger || !list || !anchorOption) {
    return { paddingTop: 0, scrollTop: 0 };
  }

  const panelRect = panel.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const anchorCenter =
    anchorClientY === null ? triggerRect.top + triggerRect.height / 2 : anchorClientY;
  const triggerCenter = anchorCenter - panelRect.top;
  const firstOptionOffset = firstOption?.offsetTop ?? anchorOption.offsetTop;
  const activeCenter = anchorOption.offsetTop - firstOptionOffset + anchorOption.offsetHeight / 2;
  const listHeight = list.scrollHeight || list.getBoundingClientRect().height;
  const panelHeight = panel.clientHeight || panelRect.height;
  const delta = triggerCenter - activeCenter;

  if (delta >= 0) {
    const maxPaddingTop = listHeight > panelHeight ? delta : Math.max(0, panelHeight - listHeight);
    return { paddingTop: Math.min(delta, maxPaddingTop), scrollTop: 0 };
  }

  return { paddingTop: 0, scrollTop: Math.abs(delta) };
}
