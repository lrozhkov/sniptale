// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InspectorGroupedPanel,
  InspectorGroupFocusContext,
  type InspectorGroupFocusIntent,
} from './index';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
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
});

describe('grouped-inspector focus intent', () => {
  it('opens the focused group after a new external intent', () => {
    renderFocusedPanel({ groupId: 'effect-v1', token: 'effect-1' });

    expect(container?.textContent).toContain('Template controls');
    expect(container?.textContent).not.toContain('General controls');
  });

  it('does not override a manual group switch for the same intent token', () => {
    renderFocusedPanel({ groupId: 'effect-v1', token: 'effect-1' });
    clickGroup('General');

    expect(container?.textContent).toContain('General controls');

    renderFocusedPanel({ groupId: 'effect-v1', token: 'effect-1' });

    expect(container?.textContent).toContain('General controls');
    expect(container?.textContent).not.toContain('Template controls');
  });
});

function renderFocusedPanel(focusIntent: InspectorGroupFocusIntent) {
  act(() => {
    root?.render(
      <InspectorGroupFocusContext.Provider value={focusIntent}>
        <InspectorGroupedPanel
          groups={[
            {
              content: 'General controls',
              defaultActive: true,
              id: 'general',
              label: 'General',
            },
            {
              content: 'Template controls',
              id: 'effect-v1',
              label: 'Templates',
            },
          ]}
        />
      </InspectorGroupFocusContext.Provider>
    );
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
