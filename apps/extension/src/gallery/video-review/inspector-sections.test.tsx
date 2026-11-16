// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Info, SlidersHorizontal } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('navigates parameter sections and keeps commands in a separate unlabelled bottom tray', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const run = vi.fn();
  const one = { id: 'position', label: 'Position', icon: Info, content: <input aria-label="x" /> };
  const two = {
    id: 'appearance',
    label: 'Appearance',
    icon: SlidersHorizontal,
    content: <input aria-label="color" />,
  };
  const commands = reviewInspectorActions(<button onClick={run}>Remove item</button>);
  try {
    await act(async () => root.render(<ReviewInspectorSections sections={[one, two, commands]} />));
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Position', 'Appearance']);
    expect(host.querySelector('h3, summary')).toBeNull();
    expect(host.querySelector('[aria-label="x"]')).not.toBeNull();
    await act(async () => tabs[1]!.click());
    expect(host.querySelector('[aria-label="color"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="x"]')).toBeNull();
    const tray = host.querySelector('[data-ui="gallery.videoReview.inspectorActionTray"]')!;
    expect(tray.textContent).toBe('Remove item');
    expect(tray).toBe(tray.parentElement!.lastElementChild);
    await act(async () => tray.querySelector('button')!.click());
    expect(run).toHaveBeenCalledOnce();
    // Removing the remembered section selects the surviving group without a redundant row.
    await act(async () => root.render(<ReviewInspectorSections sections={[one, commands]} />));
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelector('[aria-label="x"]')).not.toBeNull();
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBeNull();
    await act(async () => root.render(<ReviewInspectorSections sections={[commands]} />));
    expect(host.querySelector('[role="tablist"], [role="tabpanel"]')).toBeNull();
    expect(host.querySelector('[data-section="actions"] button')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
