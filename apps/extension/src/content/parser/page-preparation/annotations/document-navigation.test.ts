// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { subscribeToBrowserAnnotationDocumentNavigation } from './document-navigation';

it('keeps annotations across fragment-only navigation', () => {
  window.history.replaceState({}, '', '/article');
  const onNavigation = vi.fn();
  const unsubscribe = subscribeToBrowserAnnotationDocumentNavigation({
    onNavigation,
    windowObject: window,
  });

  window.history.pushState({}, '', '/article#see-also');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.history.pushState({}, '', '/article#references');
  window.dispatchEvent(new HashChangeEvent('hashchange'));

  expect(onNavigation).not.toHaveBeenCalled();
  unsubscribe();
});

it('notifies once for each distinct same-document page identity', () => {
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

it('treats a query change as a new page identity', () => {
  window.history.replaceState({}, '', '/article?view=summary#top');
  const onNavigation = vi.fn();
  const unsubscribe = subscribeToBrowserAnnotationDocumentNavigation({
    onNavigation,
    windowObject: window,
  });

  window.history.pushState({}, '', '/article?view=details#top');
  window.dispatchEvent(new PopStateEvent('popstate'));

  expect(onNavigation).toHaveBeenCalledOnce();
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
