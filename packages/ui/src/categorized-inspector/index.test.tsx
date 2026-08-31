// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CategorizedInspector } from './index';

const sections = [
  { id: 'outline', label: 'Outline', icon: () => <span>O</span> },
  { id: 'fill', label: 'Fill', icon: () => <span>F</span> },
  { id: 'effects', label: 'Effects', icon: () => <span>E</span> },
] as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('selects categories and supports roving keyboard navigation', () => {
  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Border categories"
        initialSection="outline"
        renderSection={(section) => <div data-section={section}>{section}</div>}
        sections={sections}
      />
    );
  });

  const outline = container.querySelector<HTMLButtonElement>('button[aria-label="Outline"]');
  const fill = container.querySelector<HTMLButtonElement>('button[aria-label="Fill"]');
  const effects = container.querySelector<HTMLButtonElement>('button[aria-label="Effects"]');
  expect(outline?.getAttribute('aria-pressed')).toBe('true');

  act(() => fill?.click());
  expect(fill?.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-section="fill"]')).not.toBeNull();

  act(() => {
    fill?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
  });
  expect(effects?.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(effects);
});

it('optionally shows the active section label above its controls', () => {
  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Border categories"
        initialSection="outline"
        renderSection={(section) => <div data-section={section}>{section}</div>}
        renderSectionHeadingControl={(section) => (
          <button data-heading-control={section}>On</button>
        )}
        sections={sections}
        showSectionHeading
      />
    );
  });

  const heading = container.querySelector(
    '[data-ui="shared.categorized-inspector.section-heading"]'
  );
  expect(heading?.querySelector('span')?.textContent).toBe('Outline');
  expect(heading?.className).toContain('text-[13px]');
  expect(container.querySelector('[data-heading-control="outline"]')).not.toBeNull();
  act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Fill"]')?.click());
  expect(heading?.querySelector('span')?.textContent).toBe('Fill');
  expect(container.querySelector('[data-heading-control="fill"]')).not.toBeNull();
});

it('shows a compact section status in the navigation instead of consuming header space', () => {
  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Template settings"
        initialSection="outline"
        renderSection={(section) => <div data-section={section}>{section}</div>}
        sections={[
          sections[0],
          { id: 'save', label: 'Save', icon: () => <span>S</span>, status: 'Unsaved' },
        ]}
      />
    );
  });

  const status = container.querySelector('[data-ui="shared.categorized-inspector.section-status"]');
  expect(status?.textContent).toBe('Unsaved');
  expect(status?.getAttribute('title')).toBe('Unsaved');
  expect(status?.closest('nav')?.className).toContain('border-solid');
});

it('wraps arrow navigation and ignores unrelated keys', () => {
  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Border categories"
        initialSection="fill"
        renderSection={(section) => <div data-section={section} />}
        sections={sections}
      />
    );
  });

  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const press = (label: string, key: string) => {
    act(() => {
      button(label)?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    });
  };

  press('Fill', 'ArrowDown');
  expect(button('Effects')?.getAttribute('aria-pressed')).toBe('true');
  press('Effects', 'ArrowRight');
  expect(button('Outline')?.getAttribute('aria-pressed')).toBe('true');
  press('Outline', 'ArrowUp');
  expect(button('Effects')?.getAttribute('aria-pressed')).toBe('true');
  press('Effects', 'Home');
  expect(button('Outline')?.getAttribute('aria-pressed')).toBe('true');
  press('Outline', 'Enter');
  expect(button('Outline')?.getAttribute('aria-pressed')).toBe('true');
});

it('falls back when the active category disappears and renders nothing without categories', () => {
  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Border categories"
        initialSection="fill"
        renderSection={(section) => <div data-section={section} />}
        sections={sections}
      />
    );
  });
  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Border categories"
        initialSection="fill"
        renderSection={(section) => <div data-section={section} />}
        sections={[sections[2]]}
      />
    );
  });
  expect(container.querySelector('[data-section="effects"]')).not.toBeNull();

  act(() => {
    root.render(
      <CategorizedInspector
        ariaLabel="Border categories"
        initialSection="fill"
        renderSection={(section) => <div data-section={section} />}
        sections={[]}
      />
    );
  });
  expect(container.innerHTML).toBe('');
});
