// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { clickHostPageElement, getHostPageClickBlockReason } from '.';

function createConnectedButton(): HTMLButtonElement {
  const button = document.createElement('button');
  document.body.append(button);
  return button;
}

describe('host-page-programmatic-click', () => {
  it('blocks detached controls before clicking them', () => {
    const button = document.createElement('button');

    expect(getHostPageClickBlockReason(button)).toBe('detached');
    expect(clickHostPageElement(button)).toEqual({
      clicked: false,
      reason: 'detached',
    });
  });

  it('blocks disabled and inert controls', () => {
    const disabledButton = createConnectedButton();
    disabledButton.disabled = true;

    const inertContainer = document.createElement('div');
    inertContainer.setAttribute('inert', '');
    const inertButton = document.createElement('button');
    inertContainer.append(inertButton);
    document.body.append(inertContainer);

    expect(getHostPageClickBlockReason(disabledButton)).toBe('disabled');
    expect(getHostPageClickBlockReason(inertButton)).toBe('inert');
  });

  it('blocks controls nested inside navigation anchors', () => {
    const link = document.createElement('a');
    link.href = 'https://example.com/preview';
    const image = document.createElement('img');
    link.append(image);
    document.body.append(link);

    expect(getHostPageClickBlockReason(image)).toBe('navigation-prone-anchor');
  });

  it('allows safe connected controls', () => {
    const button = createConnectedButton();

    expect(clickHostPageElement(button)).toEqual({
      clicked: true,
      reason: null,
    });
  });
});
