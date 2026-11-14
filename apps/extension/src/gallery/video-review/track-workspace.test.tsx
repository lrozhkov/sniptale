// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTrackWorkspace, ReviewTrackWorkspaceTabs } from './track-workspace';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('switches lane tabs by click and keyboard while retaining the mounted collection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Fixture({ settings = true }: { settings?: boolean }) {
    const [tab, setTab] = useState<'list' | 'settings'>('list');
    return (
      <>
        <ReviewTrackWorkspaceTabs
          id="lane"
          track="source"
          tab={tab}
          hasSettings={settings}
          onTabChange={setTab}
        />
        <ReviewTrackWorkspace
          id="lane"
          track="source"
          tab={tab}
          list={<input aria-label="filter" defaultValue="retained" />}
          settings={settings ? <button>Global settings</button> : undefined}
        />
      </>
    );
  }
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const key = async (value: string) =>
    act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true })
      );
    });
  try {
    await act(async () => root.render(<Fixture />));
    const filter = host.querySelector('input')!;
    await act(async () => tabs()[1]!.click());
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[id="lane-list"]')?.hasAttribute('hidden')).toBe(true);
    tabs()[1]!.focus();
    await key('Home');
    expect(document.activeElement).toBe(tabs()[0]);
    expect(host.querySelector('input')).toBe(filter);
    await key('ArrowRight');
    expect(document.activeElement).toBe(tabs()[1]);
    await key('ArrowLeft');
    expect(document.activeElement).toBe(tabs()[0]);
    await key('End');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    await key('Escape');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => tabs()[0]!.click());
    expect(filter.value).toBe('retained');
    await act(async () => tabs()[1]!.click());
    await act(async () => root.render(<Fixture settings={false} />));
    expect(tabs()).toHaveLength(1);
    expect(host.querySelector('[id="lane-list"]')?.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('[id="lane-settings"]')).toBeNull();
    tabs()[0]!.focus();
    await key('ArrowRight');
    expect(document.activeElement).toBe(tabs()[0]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
