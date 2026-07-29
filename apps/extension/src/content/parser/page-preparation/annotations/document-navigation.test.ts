// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { subscribeToBrowserAnnotationDocumentNavigation } from './document-navigation';

it('notifies once for each distinct same-document URL', () => {
  const onNavigation = vi.fn();
  const unsubscribe = subscribeToBrowserAnnotationDocumentNavigation({
    onNavigation,
    windowObject: window,
  });

  window.history.pushState({}, '', '/first');
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.history.pushState({}, '', '/second');
  window.dispatchEvent(new PopStateEvent('popstate'));

  expect(onNavigation).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it('stops observing after cleanup', () => {
  const onNavigation = vi.fn();
  const unsubscribe = subscribeToBrowserAnnotationDocumentNavigation({
    onNavigation,
    windowObject: window,
  });

  unsubscribe();
  window.history.pushState({}, '', '/after-cleanup');
  window.dispatchEvent(new PopStateEvent('popstate'));

  expect(onNavigation).not.toHaveBeenCalled();
});
