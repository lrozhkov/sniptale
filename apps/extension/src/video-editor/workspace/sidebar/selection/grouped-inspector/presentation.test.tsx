// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WorkspacePreferencesProvider,
  useWorkspacePreference,
} from '../../../../runtime/controller/workspace-preferences';
import { InspectorGroupedPanel } from './panel';
import { InspectorGroupFocusContext, type InspectorGroupFocusIntent } from './focus';
import { InspectorSectionMemoryProvider, InspectorSelectionFamilyContext } from './presentation';
import { DEFAULT_WORKSPACE_PREFERENCES } from '../../../../persistence/workspace-preferences';
vi.mock('../../../../persistence/workspace-preferences', async (original) => ({
  ...(await original<object>()),
  loadWorkspacePreferences: async () => DEFAULT_WORKSPACE_PREFERENCES,
  saveWorkspacePreferences: async () => {},
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let family = 'scene';
let focusIntent: InspectorGroupFocusIntent | null = null;
let extra = true;
function Content() {
  const [mode, setMode] = useWorkspacePreference('inspectorPresentation');
  return (
    <>
      <button data-mode onClick={() => setMode(mode === 'all' ? 'sections' : 'all')}>
        Mode
      </button>
      <InspectorSelectionFamilyContext.Provider value={family}>
        <InspectorGroupedPanel
          groups={[
            {
              id: 'main',
              semantic: 'framing',
              label: 'Main',
              content: <input aria-label="Main field" />,
            },
            {
              id: 'other',
              semantic: 'animation',
              label: 'Other',
              visible: extra,
              content: <input aria-label="Other field" />,
            },
            { id: 'info', semantic: 'info', label: 'Info', content: 'Metadata' },
          ]}
        />
      </InspectorSelectionFamilyContext.Provider>
    </>
  );
}
const render = () =>
  root.render(
    <WorkspacePreferencesProvider>
      <InspectorSectionMemoryProvider>
        <InspectorGroupFocusContext.Provider value={focusIntent}>
          <Content />
        </InspectorGroupFocusContext.Provider>
      </InspectorSectionMemoryProvider>
    </WorkspacePreferencesProvider>
  );
const click = (selector: string) =>
  act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  family = 'scene';
  focusIntent = null;
  extra = true;
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => render());
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it('remembers each type independently and returns to its chosen category after all mode', () => {
  click('[aria-label="Other"]');
  family = 'audio';
  act(render);
  expect(container.querySelector('[aria-label="Main field"]')).not.toBeNull();
  click('[aria-label="Info"]');
  family = 'scene';
  act(render);
  expect(container.querySelector('[aria-label="Other field"]')).not.toBeNull();
  click('[data-mode]');
  expect(container.querySelector('nav')).toBeNull();
  expect([...container.querySelectorAll('h3')].map((node) => node.textContent)).toEqual([
    'Main',
    'Other',
    'Info',
  ]);
  click('[data-mode]');
  expect(container.querySelector('[aria-label="Other field"]')).not.toBeNull();
  family = 'audio';
  act(render);
  expect(container.querySelector('[data-section="info"]')).not.toBeNull();
});
it('falls back when a remembered section disappears', () => {
  click('[aria-label="Other"]');
  family = 'audio';
  act(render);
  family = 'scene';
  extra = false;
  act(render);
  expect(container.querySelector('[aria-label="Main field"]')).not.toBeNull();
});

it('preserves collapsed drafts and opens the section for a new focus intent', () => {
  click('[data-mode]');
  const section = container.querySelector<HTMLElement>('[data-section="main"]')!;
  const disclosure = section.querySelector('details')!;
  const input = section.querySelector('input')!;
  expect(disclosure.open).toBe(true);
  input.value = 'draft';
  act(() => {
    disclosure.open = false;
  });
  act(render);
  expect(disclosure.open).toBe(false);
  expect(section.querySelector('input')).toBe(input);
  expect(input.value).toBe('draft');
  section.scrollIntoView = vi.fn();
  focusIntent = { groupId: 'main', token: 'open-main' };
  act(render);
  expect(disclosure.open).toBe(true);
  expect(section.scrollIntoView).toHaveBeenCalled();
});
