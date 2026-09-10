// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { InspectorGroupedPanel } from './panel';
import type { InspectorGroupDefinition } from './types';
it('exposes SDK parameter groups with their semantic icons and independent content', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const semantics = [
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
    expect(host.querySelectorAll('nav button')).toHaveLength(7);
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
