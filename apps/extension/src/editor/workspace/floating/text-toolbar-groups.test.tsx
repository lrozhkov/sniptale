// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CompactCommandField, type CompactCommand } from '../../inspector/compact';
import { createTextToolbarGroups } from './text-toolbar-groups';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<>{node}</>));
}

function textCommand(command: Partial<CompactCommand> & Pick<CompactCommand, 'id' | 'title'>) {
  return {
    trigger: command.title,
    ...command,
  } as CompactCommand;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

it('renders typography geometry through compact toggle grids and routes style clicks', () => {
  const onBold = vi.fn();
  const groups = createTextToolbarGroups([
    textCommand({
      id: 'text-align',
      title: 'Align',
      value: 'Left',
      content: (
        <CompactCommandField label="Align">
          <div>align body</div>
        </CompactCommandField>
      ),
    }),
    textCommand({
      id: 'text-vertical-align',
      title: 'Vertical',
      value: 'Top',
      content: (
        <CompactCommandField label="Vertical">
          <div>vertical body</div>
        </CompactCommandField>
      ),
    }),
    textCommand({ id: 'text-bold', title: 'Bold', active: true, onClick: onBold }),
    textCommand({ id: 'text-italic', title: 'Italic', active: false }),
  ]);
  renderNode(groups?.find((group) => group.id === 'geometry')?.content);

  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.toggle-grid"]')
  ).toHaveLength(1);
  expect(container?.textContent).toContain('align body');
  expect(container?.textContent).toContain('vertical body');

  act(() => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.click();
  });

  expect(onBold).toHaveBeenCalledTimes(1);
});
