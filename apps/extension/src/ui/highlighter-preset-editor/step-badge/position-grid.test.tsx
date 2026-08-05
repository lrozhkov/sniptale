// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StepBadgePositionGrid } from './position-grid';

it('selects all nine anchors and toggles offsets', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onAnchorChange = vi.fn();
  const onOffsetToggle = vi.fn();
  await act(async () =>
    root.render(
      <StepBadgePositionGrid
        anchor="top-left"
        offsets={[]}
        onAnchorChange={onAnchorChange}
        onOffsetToggle={onOffsetToggle}
      />
    )
  );
  expect(host.firstElementChild?.className).toContain('grid-cols-2');
  expect(host.querySelectorAll('.justify-center')).toHaveLength(2);
  expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(9);
  await act(async () =>
    (host.querySelectorAll('button[aria-pressed]')[4] as HTMLButtonElement).click()
  );
  expect(onAnchorChange).toHaveBeenCalledWith('center');
  await act(async () => (host.querySelector('button[title]') as HTMLButtonElement).click());
  expect(onOffsetToggle).toHaveBeenCalledWith('up');
  await act(async () => root.unmount());
});
