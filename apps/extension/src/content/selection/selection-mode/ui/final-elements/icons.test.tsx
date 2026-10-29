// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { Copy, Library } from 'lucide-react';
import { expect, it } from 'vitest';

import {
  createSelectionCaptureActionIcon,
  createSelectionCaptureMenuChevron,
  createSelectionPaddingIcon,
} from './icons';

it('uses Lucide Library geometry for the DOM selection action', () => {
  const icon = createSelectionCaptureActionIcon('save_to_library');
  const reference = document.createElement('div');
  reference.innerHTML = renderToStaticMarkup(<Library size={16} />);
  const expectedPaths = Array.from(reference.querySelectorAll('path'), (path) =>
    path.getAttribute('d')
  );
  const actualPaths = Array.from(icon.querySelectorAll('path'), (path) => path.getAttribute('d'));

  expect(actualPaths).toEqual(expectedPaths);
  expect(icon.dataset['selectionIcon']).toBe('library');
  expect(icon.getAttribute('width')).toBe('16');
  expect(icon.getAttribute('aria-hidden')).toBe('true');
});

it('renders independent Copy icons with the capture button and menu dimensions', () => {
  const buttonIcon = createSelectionCaptureActionIcon('copy');
  const menuIcon = createSelectionCaptureActionIcon('copy', 18);
  const reference = document.createElement('div');
  reference.innerHTML = renderToStaticMarkup(<Copy size={16} />);

  expect(buttonIcon.innerHTML).toBe(reference.querySelector('svg')?.innerHTML);
  expect(menuIcon.innerHTML).toBe(buttonIcon.innerHTML);
  expect(buttonIcon.getAttribute('width')).toBe('16');
  expect(menuIcon.getAttribute('width')).toBe('18');
  expect(menuIcon.getAttribute('height')).toBe('18');
  expect(menuIcon.dataset['selectionIcon']).toBe('copy');
  expect(menuIcon.getAttribute('aria-hidden')).toBe('true');
  expect(menuIcon.style.display).toBe('block');
  expect(menuIcon.style.flex).toBe('0 0 auto');
  expect(menuIcon.firstChild).not.toBe(buttonIcon.firstChild);
});

it('keeps the capture menu and padding controls distinct from Copy', () => {
  const copy = createSelectionCaptureActionIcon('copy');
  const chevron = createSelectionCaptureMenuChevron();
  const increase = createSelectionPaddingIcon('increase');
  const decrease = createSelectionPaddingIcon('decrease');

  expect(chevron.dataset['selectionIcon']).toBe('chevron-down');
  expect(chevron.getAttribute('width')).toBe('14');
  expect(increase.dataset['selectionIcon']).toBe('plus');
  expect(decrease.dataset['selectionIcon']).toBe('minus');
  expect(increase.getAttribute('width')).toBe('18');
  expect(decrease.getAttribute('width')).toBe('18');
  expect(increase.querySelectorAll('path')).toHaveLength(2);
  expect(decrease.querySelectorAll('path')).toHaveLength(1);
  expect(copy.querySelector('rect')).not.toBeNull();
  expect(decrease.querySelector('rect')).toBeNull();
});
