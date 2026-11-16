// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Info, Scan } from 'lucide-react';
import { ReviewTrackWorkspace, ReviewTrackWorkspaceHeading } from './track-workspace';

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
        <ReviewTrackWorkspaceHeading id="lane" track="originalAudio" />
        <ReviewTrackWorkspace
          id="lane"
          tab={tab}
          list={<input aria-label="filter" defaultValue="retained" />}
          onTabChange={setTab}
          sections={
            settings
              ? [
                  {
                    id: 'audio',
                    label: 'Audio',
                    icon: Info,
                    content: <button>Global settings</button>,
                  },
                ]
              : []
          }
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
    expect(tabs()).toHaveLength(0);
    expect(host.querySelector('[id="lane-list"]')?.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('[id="lane-audio"]')).toBeNull();
    expect(host.querySelector('[id="lane-list"]')?.getAttribute('aria-labelledby')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('uses a plain source title and a row above the retained list and individual setting panels', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Fixture() {
    const [tab, setTab] = useState<'list' | 'settings'>('list');
    return (
      <>
        <ReviewTrackWorkspaceHeading id="source" track="source" />
        <ReviewTrackWorkspace
          id="source"
          tab={tab}
          onTabChange={setTab}
          list={<input aria-label="source-filter" defaultValue="retained search" />}
          sections={[
            {
              id: 'information',
              label: 'Project',
              icon: Info,
              content: <div>Source information</div>,
            },
            {
              id: 'canvas',
              label: 'Canvas',
              icon: Scan,
              content: <input aria-label="canvas-setting" />,
            },
          ]}
        />
      </>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    expect(host.querySelector('h2')?.textContent).toBe('gallery.videoReview.sourceVideo');
    expect(host.querySelector('h2')?.closest('button')).toBeNull();
    expect(host.querySelector('h2 svg.lucide-film')).not.toBeNull();
    const footer = host.querySelector(
      '[data-ui="gallery.videoReview.inspectorSectionNavigation"]'
    )!;
    const tabs = [...footer.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('aria-label')).toBe('gallery.videoReview.trackTab');
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    const list = host.querySelector<HTMLInputElement>('[aria-label="source-filter"]')!;
    list.value = 'changed filter';
    await act(async () => tabs[2]!.click());
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[aria-label="canvas-setting"]')).not.toBeNull();
    expect(host.querySelector('#source-canvas h3')).toBeNull();
    expect(host.querySelector('#source-list')?.hasAttribute('hidden')).toBe(true);
    expect(footer.parentElement!.firstElementChild).toBe(footer);
    tabs[2]!.focus();
    await act(async () =>
      tabs[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    );
    expect(document.activeElement).toBe(tabs[0]);
    expect(host.querySelector('[aria-label="source-filter"]')).toBe(list);
    expect(list.value).toBe('changed filter');
    await act(async () =>
      tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(document.activeElement).toBe(tabs[1]);
    expect(host.querySelector('#source-information')?.textContent).toContain('Source information');
    expect(host.querySelector('#source-information')?.getAttribute('aria-labelledby')).toBe(
      tabs[1]!.id
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
