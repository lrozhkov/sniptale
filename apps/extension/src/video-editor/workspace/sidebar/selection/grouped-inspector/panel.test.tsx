// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  WorkspacePreferencesProvider,
  useWorkspacePreference,
} from '../../../../runtime/controller/workspace-preferences';
import { DEFAULT_WORKSPACE_PREFERENCES } from '../../../../persistence/workspace-preferences';
import { InspectorGroupedPanel } from './panel';
import type { InspectorGroupDefinition } from './types';
it('exposes SDK parameter groups with their semantic icons and independent content', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const semantics = [
    'watermark',
    'content',
    'typography',
    'appearance',
    'geometry',
    'processing',
    'animation',
    'advanced',
  ] as const;
  const groups: InspectorGroupDefinition<string>[] = semantics.map((semantic) => ({
    id: semantic,
    semantic,
    label: semantic,
    content: `Settings for ${semantic}`,
  }));
  try {
    act(() => root.render(<InspectorGroupedPanel groups={groups} />));
    expect(host.querySelectorAll('nav button')).toHaveLength(8);
    for (const semantic of semantics) {
      const button = host.querySelector<HTMLButtonElement>(`nav button[aria-label="${semantic}"]`)!;
      expect(button.querySelector('svg')).not.toBeNull();
      act(() => button.click());
      expect(host.querySelector(`[data-section="${semantic}"]`)?.textContent).toContain(
        `Settings for ${semantic}`
      );
      for (const other of semantics.filter((item) => item !== semantic))
        expect(host.querySelector(`[data-section="${other}"]`)).toBeNull();
    }
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

vi.mock('../../../../persistence/workspace-preferences', async (original) => ({
  ...(await original<object>()),
  loadWorkspacePreferences: async () => DEFAULT_WORKSPACE_PREFERENCES,
  saveWorkspacePreferences: async () => {},
}));

function AllPanel({ groups }: { groups: InspectorGroupDefinition<string>[] }) {
  const [, setPresentation] = useWorkspacePreference('inspectorPresentation');
  return (
    <>
      <button data-all onClick={() => setPresentation('all')}>
        All
      </button>
      <InspectorGroupedPanel groups={groups} />
    </>
  );
}

it.each(['info', 'actions'] as const)(
  'uses full width for one parameter group and %s without replacing drafts or disclosures',
  async (terminal) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const groups: InspectorGroupDefinition<string>[] = [
      {
        id: 'parameters',
        semantic: 'tracking',
        label: 'Parameters',
        content: <input defaultValue="Accepted" />,
      },
      {
        id: terminal,
        semantic: terminal,
        label: terminal,
        content: <button>Supporting command or summary</button>,
      },
    ];
    const render = () =>
      root.render(
        <WorkspacePreferencesProvider>
          <AllPanel groups={groups} />
        </WorkspacePreferencesProvider>
      );
    try {
      await act(async () => render());
      await act(async () => host.querySelector<HTMLButtonElement>('[data-all]')!.click());
      const panel = host.querySelector('[data-presentation="all"]')!;
      expect(panel.getAttribute('data-layout')).toBe('single');
      expect(
        [...panel.querySelectorAll(':scope > section')].map((node) =>
          node.getAttribute('data-section')
        )
      ).toEqual(['parameters', terminal]);
      const input = panel.querySelector('input')!;
      const disclosure = panel.querySelector('details')!;
      input.value = 'Unsubmitted draft';
      await act(async () => {
        disclosure.open = false;
      });
      await act(async () => render());
      expect(panel.querySelector('input')).toBe(input);
      expect(input.value).toBe('Unsubmitted draft');
      expect(disclosure.open).toBe(false);
      groups.splice(1, 0, {
        id: 'timing',
        semantic: 'timing',
        label: 'Timing',
        content: <input defaultValue="2" />,
      });
      await act(async () => render());
      expect(panel.getAttribute('data-layout')).toBe('two');
      expect(panel.querySelector('input')).toBe(input);
      expect(disclosure.open).toBe(false);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  }
);
