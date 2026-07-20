// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InlineTextField,
  NOTE_TONES,
  resolveNoteToneClasses,
  ScenarioNoteToneButton,
} from './content.helpers';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function renderHelper(element: React.ReactElement) {
  act(() => {
    root?.render(element);
  });
}

describe('content.helpers', () => {
  it('resolves distinct note tone classes and keeps the neutral fallback stable', () => {
    expect(resolveNoteToneClasses('info')).toContain('var(--sniptale-color-info)');
    expect(resolveNoteToneClasses('warning')).toContain('var(--sniptale-color-warning)');
    expect(resolveNoteToneClasses('error')).toContain('var(--sniptale-color-danger)');
    expect(resolveNoteToneClasses('neutral')).toContain('var(--sniptale-color-border-soft)');
    expect(NOTE_TONES).toEqual(['neutral', 'info', 'warning', 'error']);
  });
});

describe('content.helpers inline fields', () => {
  it('commits title inputs on Enter but keeps multiline editors textarea-based', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();

    renderHelper(
      <InlineTextField
        emphasis="title"
        placeholder="title"
        value="Draft title"
        onChange={onChange}
        onCommit={onCommit}
      />
    );

    const titleInput = container?.querySelector<HTMLInputElement>('input');
    if (!titleInput) {
      throw new Error('Expected title input');
    }

    act(() => {
      titleInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(titleInput.className).toContain('text-base');
    expect(titleInput.className).toContain('font-semibold');
    expect(onCommit).toHaveBeenCalledTimes(1);

    renderHelper(
      <InlineTextField multiline placeholder="body" value="Draft body" onChange={onChange} />
    );

    const bodyInput = container?.querySelector<HTMLTextAreaElement>('textarea');
    expect(bodyInput).not.toBeNull();
    expect(bodyInput?.className).toContain('resize-none');
    expect(bodyInput?.className).toContain('text-sm');
  });
});

describe('content.helpers note tone button', () => {
  it('renders translated tone labels inside the dedicated note tone button', () => {
    renderHelper(<ScenarioNoteToneButton tone="warning" onClick={vi.fn()} />);

    expect(container?.querySelector('button')?.textContent).toBe(
      'scenario.editor.noteTone.warning'
    );
  });
});
