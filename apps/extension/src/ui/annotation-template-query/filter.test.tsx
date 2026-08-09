// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AnnotationTemplateQueryControls } from './filter';

it('toggles tag filters and gives Escape to the nested filter before restoring focus', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <AnnotationTemplateQueryControls
        activeFilterTagIds={[]}
        onActiveFilterTagIdsChange={onChange}
        onQueryChange={vi.fn()}
        query=""
        tags={[{ id: 'review', label: 'Review' }]}
      />
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
  await act(async () => trigger.click());
  const option = host.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!;
  expect(document.activeElement).toBe(option);
  act(() => option.click());
  expect(onChange).toHaveBeenCalledWith(['review']);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  act(() => root.unmount());
  host.remove();
});
