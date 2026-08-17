// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./state', () => ({
  useAnnotationTemplateTagState: () => ({
    error: false,
    isLoading: false,
    setActiveFilterTagIds: vi.fn(),
    state: {
      activeFilterTagIds: [],
      schemaVersion: 1,
      tags: [
        { id: 'review', label: 'Review', origin: 'user' },
        { id: 'training', label: 'Training', origin: 'user' },
      ],
    },
  }),
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { AnnotationTemplateTagAssignment } from './assignment';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('assigns multiple tags from a collapsed dropdown field', () => {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState(['review']);
    return (
      <AnnotationTemplateTagAssignment
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        value={value}
      />
    );
  }
  act(() => root.render(<Harness />));

  const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  expect(trigger?.className).toContain('border-0');
  expect(trigger?.className).toContain('bg-transparent');
  expect(trigger?.className).not.toContain('border-[var(--sniptale-color-border-soft)]');
  expect(trigger?.className).not.toContain('bg-[var(--sniptale-color-surface-input)]');
  expect(document.body.querySelector('[role="menu"]')).toBeNull();

  act(() => trigger?.click());
  const options = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')
  );
  expect(options).toHaveLength(2);
  expect(options[0]?.getAttribute('aria-checked')).toBe('true');

  act(() => options[1]?.click());
  expect(onChange).toHaveBeenLastCalledWith(['review', 'training']);

  act(() => options[0]?.click());
  expect(onChange).toHaveBeenLastCalledWith(['training']);
});
