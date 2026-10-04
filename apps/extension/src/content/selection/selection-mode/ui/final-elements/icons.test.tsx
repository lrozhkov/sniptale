// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { Library } from 'lucide-react';
import { expect, it } from 'vitest';

import { createSelectionCaptureActionIcon } from './icons';

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
