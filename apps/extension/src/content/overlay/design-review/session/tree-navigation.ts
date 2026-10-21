import { useEffect, useLayoutEffect, useRef } from 'react';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { isSelectablePageElement } from '../../../selection/page-element-target';
import type { DesignReviewViewState } from '../types';

function findSelectableParent(target: Element): Element | null {
  let parent = target.parentElement;
  while (parent) {
    const next = parent.parentElement;
    if (isSelectablePageElement(parent)) return parent;
    parent = next;
  }
  return null;
}

export function useDesignReviewTreeNavigation(target: Element | null) {
  const branches = useRef(new WeakMap<Element, Element>());
  useEffect(
    () =>
      pagePreparationHistory.subscribeToClear(() => {
        branches.current = new WeakMap();
      }),
    []
  );
  useLayoutEffect(() => {
    if (!target?.isConnected) return;
    let child = target;
    let parent = findSelectableParent(child);
    while (parent) {
      branches.current.set(parent, child);
      child = parent;
      parent = findSelectableParent(child);
    }
  }, [target]);

  return (): DesignReviewViewState['treeNavigation'] => {
    if (!target?.isConnected) return { parent: null, child: null };
    const remembered = branches.current.get(target);
    const rememberedIsValid =
      remembered &&
      isSelectablePageElement(remembered) &&
      findSelectableParent(remembered) === target;
    const children = Array.from(target.children).filter(isSelectablePageElement);
    return {
      parent: findSelectableParent(target),
      child: rememberedIsValid ? remembered : children.length === 1 ? children[0]! : null,
    };
  };
}
