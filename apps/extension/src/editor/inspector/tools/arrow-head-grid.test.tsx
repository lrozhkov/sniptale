// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ArrowHeadPreviewGrid } from './arrow-head-grid';
import {
  CollapsibleSection,
  HeaderValueToggleSection,
  PanelSection,
  renderSelectionActionsSectionWithController,
} from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders labeled arrow-head previews and routes selection changes', () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <ArrowHeadPreviewGrid
        ariaLabel="Heads"
        value="diamond-outline"
        onChange={onChange}
        options={[
          { label: 'None', value: 'none' },
          { label: 'Arrow', value: 'arrow' },
          { label: 'Triangle', value: 'triangle' },
          { label: 'Triangle outline', value: 'triangle-outline' },
          { label: 'Bar', value: 'bar' },
          { label: 'Circle', value: 'circle' },
          { label: 'Circle outline', value: 'circle-outline' },
          { label: 'Diamond', value: 'diamond' },
          { label: 'Diamond outline', value: 'diamond-outline' },
          { label: 'Rounded', value: 'block' },
        ]}
      />
    );
  });

  act(() => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="Rounded"]')?.click();
  });

  expect(container?.querySelector('[role="group"]')?.className).toContain('grid-cols-2');
  expect(container?.querySelectorAll('button')).toHaveLength(10);
  expect(container?.textContent).toContain('Diamond outline');
  expect(
    container?.querySelector('button[aria-label="Diamond outline"]')?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(container?.querySelectorAll('svg')).toHaveLength(10);
  expect(onChange).toHaveBeenCalledWith('block');
});

it('renders header value toggles through the shared option row', () => {
  const onToggle = vi.fn();

  act(() => {
    root?.render(
      <HeaderValueToggleSection
        active
        disabled={false}
        label="Динамическая толщина"
        value="Вкл"
        onToggle={onToggle}
      />
    );
  });

  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.compact-inspector.option-row"]'
  );

  act(() => {
    button?.click();
  });

  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(container?.textContent).toContain('Динамическая толщина');
  expect(container?.textContent).toContain('Вкл');
  expect(onToggle).toHaveBeenCalledOnce();
});

it('renders shared sections and preserves collapsed selection-action removal', () => {
  act(() => {
    root?.render(
      <>
        <PanelSection label="Line" value="4px">
          line-body
        </PanelSection>
        <CollapsibleSection label="Shadow" value="Off">
          shadow-body
        </CollapsibleSection>
        {renderSelectionActionsSectionWithController(
          {
            canDeleteSelection: true,
            panelButtonClassName: 'panel-button',
            selection: { hasSelection: true, selectedObjectType: 'arrow' } as never,
            selectionDeleteIcon: <span>delete</span>,
            selectionDuplicateIcon: <span>duplicate</span>,
          },
          { deleteSelection: vi.fn(), duplicateSelection: vi.fn() }
        )}
      </>
    );
  });

  const collapsibleButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('Shadow')
  );
  expect(container?.textContent).toContain('line-body');
  expect(container?.textContent).toContain('shadow-body');
  expect(collapsibleButton?.getAttribute('aria-expanded')).toBe('true');
  expect(container?.textContent).not.toContain('duplicate');

  act(() => {
    collapsibleButton?.click();
  });

  expect(collapsibleButton?.getAttribute('aria-expanded')).toBe('false');
  expect(container?.textContent).not.toContain('shadow-body');
});
