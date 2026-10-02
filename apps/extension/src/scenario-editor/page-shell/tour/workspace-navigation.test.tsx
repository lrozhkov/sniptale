// @vitest-environment jsdom
import { act } from 'react';
import type { TourNavigationSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { useGuidePanels } from '../panel-layout';
import { TourWorkspace } from './workspace';

it('keeps scene, inspector and both navigation controls in sync without authoring a change', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const project = createGuideProject('Navigation');
  project.tour = createTourDocument();
  const first = createTourImageSlide('first');
  first.title = 'First';
  first.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 100,
    height: 100,
    alt: 'Image',
    source: { kind: 'import', filename: 'image.png' },
  };
  first.annotations = ['one', 'two'].map((id) => ({
    id,
    text: id,
    anchor: null,
    appearance: null,
  }));
  const empty = createTourImageSlide('empty');
  empty.title = 'Empty';
  const last = {
    ...structuredClone(first),
    id: 'last',
    title: 'Last',
    annotations: [{ id: 'three', text: 'three', anchor: null, appearance: null }],
  };
  const menu: TourNavigationSlide = {
    kind: 'navigation',
    id: 'menu',
    title: 'Menu',
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: first.timing,
    buttons: Array.from({ length: 13 }, (_, index) => ({
      id: `button-${index + 1}`,
      label: `Button ${index + 1}`,
      action: { kind: 'none' },
    })),
  };
  project.tour.slides = [first, empty, menu, last];
  const before = structuredClone(project);
  const changed = vi.fn();
  function Probe() {
    const panels = useGuidePanels();
    return (
      <TourWorkspace
        project={project}
        images={{ image: 'data:image/png;base64,AA==' }}
        panels={panels}
        header={() => <header>Header</header>}
        disabled={false}
        t={createTranslator('en')}
        onChange={changed}
        onImport={vi.fn()}
      />
    );
  }
  const shadow = () => host.querySelector('.tour-stage-host')!.shadowRoot!;
  const control = (name: string) =>
    shadow().querySelector<HTMLButtonElement>(`[data-tour-${name}]`)!;
  const click = async (name: string) => act(async () => control(name).click());
  const slideId = () => shadow().querySelector<HTMLElement>('#tour-player')!.dataset['slideId'];
  try {
    await act(async () => root.render(<Probe />));
    expect(control('previous').disabled).toBe(true);
    await click('hint-next');
    expect(shadow().querySelector('[data-tour-hint-text]')!.textContent).toBe('two');
    expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe('two');
    await click('hint-next');
    expect(slideId()).toBe('empty');
    expect(control('previous').disabled).toBe(false);
    await click('next');
    expect(slideId()).toBe('menu');
    const firstButton = shadow().querySelector<HTMLButtonElement>(
      '[data-tour-object-id="button-1"]'
    )!;
    firstButton.focus();
    await act(async () => firstButton.click());
    expect(shadow().activeElement?.getAttribute('data-tour-object-id')).toBe('button-1');
    for (let index = 1; index < 13; index++) await click('next');
    expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe(
      'Button 13'
    );
    expect(
      shadow().querySelector('[data-tour-object-id="button-13"][data-selected="true"]')
    ).not.toBeNull();
    await click('next');
    expect(slideId()).toBe('last');
    expect(control('next').disabled).toBe(true);
    expect(control('hint-next').disabled).toBe(true);
    await click('previous');
    expect(slideId()).toBe('menu');
    expect(
      shadow().querySelector('[data-tour-object-id="button-13"][data-selected="true"]')
    ).not.toBeNull();
    for (let index = 1; index < 13; index++) await click('previous');
    await click('previous');
    expect(slideId()).toBe('empty');
    await click('previous');
    expect(slideId()).toBe('first');
    expect(shadow().querySelector('[data-tour-hint-text]')!.textContent).toBe('two');
    await click('hint-previous');
    expect(control('previous').disabled).toBe(true);
    expect(control('hint-previous').disabled).toBe(true);
    await click('contents');
    const row = [
      ...shadow().querySelectorAll<HTMLButtonElement>('.tour-contents-list button'),
    ].find((button) => button.textContent?.includes('Last'))!;
    await act(async () => row.click());
    expect(slideId()).toBe('last');
    expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe('Last');
    expect(changed).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
