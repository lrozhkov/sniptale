// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { RecordingIcon } from './recording-icon';

it('keeps a transparent gap between the outer ring and filled recording center', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<RecordingIcon size={18} className="record-marker" />));
  const icon = host.querySelector('svg')!;
  expect(icon.getAttribute('fill')).toBe('none');
  expect(icon.getAttribute('width')).toBe('18');
  expect(icon.classList.contains('record-marker')).toBe(true);
  expect([...icon.querySelectorAll('circle')].map((circle) => circle.getAttribute('r'))).toEqual([
    '10',
    '7',
  ]);
  expect(icon.querySelector('circle:last-child')?.getAttribute('fill')).toBe('currentColor');
  expect(icon.querySelector('circle:last-child')?.getAttribute('stroke')).toBe('none');
  act(() => root.unmount());
});
