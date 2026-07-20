import { act } from 'react';

export function clickControl(selector: string) {
  const trigger = document.querySelector(selector);

  act(() => {
    trigger?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

export function createTree() {
  return {
    context: 'test',
    sections: [],
    structure: [],
    title: 'Test page',
  };
}

export function readOutput(selector: string) {
  return document.querySelector(selector)?.textContent;
}
