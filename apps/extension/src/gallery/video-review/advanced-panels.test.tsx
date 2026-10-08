// @vitest-environment jsdom
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { createQuickEditBorder } from '../../features/video/review/advanced/border';
import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import { ReviewDetails } from './controls';
import { createInspectorDisclosureStore } from '../../composition/persistence/inspector-disclosures/store';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewAdvancedPanels, ReviewSceneProperties } from './advanced-panels';
import { ReviewZoomInspector } from './zoom-inspector';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { useReviewZoomEditor } from './zoom-editor';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function Harness({ pending = false }: { pending?: boolean }) {
  const [advanced, setAdvanced] = useState<QuickEditAdvancedState>(createQuickEditAdvancedState());
  const setBackground = (
    update: (
      background: QuickEditAdvancedState['background']
    ) => QuickEditAdvancedState['background']
  ) => setAdvanced((current) => ({ ...current, background: update(current.background) }));
  const zoom = useReviewZoomEditor({
    setZoom: (update) => setAdvanced((current) => ({ ...current, zoom: update(current.zoom) })),
    zoom: advanced.zoom,
    timelineDuration: 10,
  });
  return (
    <>
      <button
        type="button"
        aria-label="toggleMode"
        onClick={() =>
          setAdvanced((current) => ({
            ...current,
            ui: { ...current.ui, mode: current.ui.mode === 'basic' ? 'advanced' : 'basic' },
          }))
        }
      />
      <button type="button" aria-label="addZoom" onClick={() => zoom.add(3, 10)} />
      {advanced.ui.mode === 'advanced' ? (
        <ReviewSceneProperties
          background={advanced.background}
          canvas={advanced.canvas}
          source={{ width: 320, height: 180 }}
          onCanvas={vi.fn()}
          audio={advanced.audio}
          hasOriginalAudio={true}
          onOriginalVolume={vi.fn()}
          onLaneVolume={vi.fn()}
          busy={false}
          pending={pending}
          failed={false}
          onImportImage={vi.fn()}
          setBackground={setBackground}
        />
      ) : null}
      <ReviewAdvancedPanels advanced={advanced} zoom={zoom} />
    </>
  );
}

const button = (key: string) => {
  const match = Array.from(host.querySelectorAll('button')).find(
    (node) => node.getAttribute('aria-label') === key || node.textContent === key
  );
  if (!match) throw new Error(`Missing button: ${key}`);
  return match;
};

it('shows the same authored source seconds as the focus block under Speed', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 1 }),
    sourceAnchor: { start: 4, end: 6 },
  };
  act(() =>
    root.render(
      <ReviewZoomInspector
        region={region}
        onChange={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const interval = host.querySelector('[data-ui="gallery.videoReview.interval"]')!;
  expect(interval.textContent).toContain('4.0 – 6.0');
});

it('edits the background paint and the selected zoom region through the panel callbacks', async () => {
  act(() => root.render(<Harness />));
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).toBeNull();
  await act(async () => button('toggleMode').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();

  await act(async () => button('gallery.videoReview.backgroundSolid').click());
  expect(button('gallery.videoReview.backgroundSolid').getAttribute('aria-pressed')).toBe('true');
  expect(button('gallery.videoReview.backgroundNone').getAttribute('aria-pressed')).toBe('false');
  await act(async () => button('gallery.videoReview.backgroundNone').click());
  expect(button('gallery.videoReview.backgroundNone').getAttribute('aria-pressed')).toBe('true');

  await act(async () => button('addZoom').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).not.toBeNull();
  const focusX = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.zoomFocusX"]'
  )!;
  expect(focusX.value).toBe('50');
  setInputValue(focusX, '20');
  await act(async () => {
    focusX.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(focusX.value).toBe('20');
  await act(async () => button('gallery.videoReview.zoomResetPosition').click());
  expect(focusX.value).toBe('50');
  await act(async () => button('gallery.videoReview.zoomDelete').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();

  await act(async () => button('toggleMode').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).toBeNull();
});

it('restores nested disclosure choices after another object and a fresh editor mount', async () => {
  const values: Record<string, unknown> = {};
  const storage = {
    get: async () => values,
    set: async (next: Record<string, unknown>) => {
      Object.assign(values, next);
    },
  };
  let store = createInspectorDisclosureStore(storage);
  const render = (scope: string, instance: string) =>
    root.render(
      <InspectorDisclosurePreferences scope={scope} store={store}>
        <ReviewDetails key={instance} preferenceId="precise-position" label="Precise position">
          <input defaultValue="draft" />
        </ReviewDetails>
      </InspectorDisclosurePreferences>
    );
  await act(async () => render('gallery:zoom', 'first'));
  const details = host.querySelector('details')!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
  await act(async () => render('gallery:scene', 'scene'));
  expect(host.querySelector('details')!.open).toBe(false);
  await act(async () => render('gallery:zoom', 'second'));
  expect(host.querySelector('details')!.open).toBe(true);
  await act(async () => root.render(null));
  store = createInspectorDisclosureStore(storage);
  await act(async () => render('gallery:zoom', 'another-project'));
  expect(host.querySelector('details')!.open).toBe(true);
});

it('disables dormant Spotlight conversion when revival would overlap an active Zoom', async () => {
  const { createQuickEditSpotlight } = await import('../../features/video/review/advanced/focus');
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'dormant', at: 1, duration: 2, endMax: 10 }),
      spotlight: createQuickEditSpotlight(),
      dormant: true,
    },
    createQuickEditZoomRegion({ id: 'camera', at: 2, duration: 2, endMax: 10 }),
  ];
  const setZoom = vi.fn();
  function DormantHarness() {
    const zoom = useReviewZoomEditor({
      zoom: advanced.zoom,
      timelineDuration: 10,
      selection: 'dormant',
      setZoom,
    });
    return <ReviewAdvancedPanels advanced={advanced} zoom={zoom} />;
  }
  act(() => root.render(<DormantHarness />));
  const zoomButton = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.focusType"] button[title="gallery.videoReview.zoomRegionLabel"]'
  )!;
  expect(zoomButton.disabled).toBe(true);
  expect(host.textContent).toContain('gallery.videoReview.focusZoomConflict');
  act(() => zoomButton.click());
  expect(setZoom).not.toHaveBeenCalled();
});

it('routes Border numeric drafts through the panel and cancels without a durable mutation', async () => {
  const { createQuickEditBorder } = await import('../../features/video/review/advanced/border');
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const region = {
    ...createQuickEditZoomRegion({ id: 'border', at: 1, duration: 2, endMax: 10 }),
    border: createQuickEditBorder(),
  };
  advanced.zoom.regions = [region];
  const setZoom = vi.fn();
  function DraftHarness() {
    const zoom = useReviewZoomEditor({
      zoom: advanced.zoom,
      timelineDuration: 10,
      selection: region.id,
      setZoom,
    });
    return (
      <>
        <output data-testid="draft-width">{zoom.previewRegion(region).border!.width}</output>
        <ReviewAdvancedPanels advanced={advanced} zoom={zoom} />
      </>
    );
  }
  act(() => root.render(<DraftHarness />));
  const range = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.borderWidth range"]'
  )!;
  await act(async () => {
    range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    setInputValue(range, '9');
  });
  expect(host.querySelector('[data-testid="draft-width"]')!.textContent).toBe('9');
  expect(region.border.width).toBe(3);
  expect(setZoom).not.toHaveBeenCalled();
  await act(async () =>
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  await act(async () => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  expect(host.querySelector('[data-testid="draft-width"]')!.textContent).toBe('3');
  expect(setZoom).not.toHaveBeenCalled();
});

it('duplicates the selected overlay through the panel binding and selects its independent copy', () => {
  const initial = createQuickEditAdvancedState();
  initial.ui.mode = 'advanced';
  initial.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'original', at: 1 }),
      border: createQuickEditBorder(),
      sourceAnchor: { start: 1, end: 3 },
    },
  ];
  initial.audio.voiceoverSegments = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 1.5, end: 2, requestedStart: 1.5, requestedEnd: 2 },
  ]);
  let state = initial;
  let selected: string | null = null;
  function CopyHarness() {
    const [advanced, setAdvanced] = useState(initial);
    const zoom = useReviewZoomEditor({
      zoom: advanced.zoom,
      setZoom: (update) => setAdvanced((current) => ({ ...current, zoom: update(current.zoom) })),
      timelineDuration: 10,
    });
    state = advanced;
    selected = zoom.selection;
    return (
      <>
        <button aria-label="selectOriginal" onClick={() => zoom.setSelection('original')} />
        <ReviewAdvancedPanels advanced={advanced} zoom={zoom} />
      </>
    );
  }
  act(() => root.render(<CopyHarness />));
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="selectOriginal"]')!.click());
  const copy = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.focusDuplicate"]'
  )!;
  expect(copy.disabled).toBe(false);
  expect(host.textContent).toContain('gallery.videoReview.cutOverlapHint');
  act(() => copy.click());
  expect(state.zoom.regions).toHaveLength(2);
  expect(selected).not.toBe('original');
  expect(state.zoom.regions.find((item) => item.id === selected)?.sourceAnchor).toEqual({
    start: 1,
    end: 3,
  });
  expect(state.zoom.regions.find((item) => item.id === selected)?.border).toEqual(
    initial.zoom.regions[0]!.border
  );
});

it('does not insert a loading paragraph above scene sections during background import', async () => {
  act(() => root.render(<Harness pending />));
  await act(async () => button('toggleMode').click());
  expect(host.textContent).not.toContain('gallery.videoReview.backgroundImporting');
});

function mountSpatialDraftPanel() {
  const initial = createQuickEditAdvancedState();
  initial.ui.mode = 'advanced';
  const region = {
    ...createQuickEditZoomRegion({ id: 'spatial-draft', at: 1, duration: 2, endMax: 10 }),
    perspective: { enabled: true, rotateX: 10, rotateY: 20, rotateZ: 30, strength: 0.5 },
    depthOfField: {
      enabled: true,
      mode: 'area' as const,
      x: 0.5,
      y: 0.5,
      width: 0.2,
      softness: 0.3,
      strength: 0.5,
    },
  };
  initial.zoom.regions = [region];
  let authored = initial;
  let owner: ReturnType<typeof useReviewZoomEditor>;
  const mutations = vi.fn();
  function SpatialDraftPanel() {
    const [advanced, setAdvanced] = useState(initial);
    const zoom = useReviewZoomEditor({
      zoom: advanced.zoom,
      selection: region.id,
      timelineDuration: 10,
      setZoom: (update) => {
        mutations();
        setAdvanced((current) => ({ ...current, zoom: update(current.zoom) }));
      },
    });
    authored = advanced;
    owner = zoom;
    return <ReviewAdvancedPanels advanced={advanced} zoom={zoom} />;
  }
  act(() => root.render(<SpatialDraftPanel />));
  const input = (name: string, range = false) => {
    const node = host.querySelector<HTMLInputElement>(
      `input[aria-label="gallery.videoReview.${name}${range ? ' range' : ''}"]`
    );
    if (!node) throw new Error(`Missing spatial numeric input: ${name}`);
    return node;
  };
  return {
    region,
    input,
    mutations,
    authored: () => authored.zoom.regions[0]!,
    owner: () => owner,
  };
}

it('mirrors real zoom-owner spatial drafts in precise fields and restores authored values on cancellation', () => {
  const panel = mountSpatialDraftPanel();
  act(() =>
    panel.owner().preview(panel.region.id, {
      perspective: { ...panel.region.perspective, rotateX: 34.2 },
      depthOfField: { ...panel.region.depthOfField, width: 0.508 },
    })
  );
  expect(panel.input('perspectiveX').value).toBe('34.2');
  expect(panel.input('depthWidth').value).toBe('50.8');
  expect(panel.authored().perspective?.rotateX).toBe(10);
  expect(panel.authored().depthOfField?.width).toBe(0.2);
  expect(panel.mutations).not.toHaveBeenCalled();
  act(() => panel.owner().preview(panel.region.id, null));
  expect(panel.input('perspectiveX').value).toBe('10');
  expect(panel.input('depthWidth').value).toBe('20');
  expect(panel.mutations).not.toHaveBeenCalled();
});

it.each(['perspectiveX', 'depthWidth'])(
  'commits one %s range edit after its transient value has rerendered through the real panel',
  async (name) => {
    const panel = mountSpatialDraftPanel();
    const range = panel.input(name, true);
    await act(async () => {
      range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      setInputValue(range, '45');
    });
    expect(panel.input(name).value).toBe('45');
    expect(panel.authored()).toEqual(panel.region);
    expect(panel.mutations).not.toHaveBeenCalled();
    await act(async () => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(panel.mutations).toHaveBeenCalledTimes(1);
    expect(
      name === 'perspectiveX'
        ? panel.authored().perspective?.rotateX
        : panel.authored().depthOfField?.width
    ).toBe(name === 'perspectiveX' ? 45 : 0.45);
    expect(panel.input(name).value).toBe('45');
  }
);

it.each(['perspectiveX', 'depthWidth'])(
  'cancels %s range preview and ignores its later pointerup after exact fields have synchronized',
  async (name) => {
    const panel = mountSpatialDraftPanel();
    const range = panel.input(name, true);
    await act(async () => {
      range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      setInputValue(range, '45');
    });
    expect(panel.input(name).value).toBe('45');
    await act(async () =>
      range.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    await act(async () => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(panel.input(name).value).toBe(name === 'perspectiveX' ? '10' : '20');
    expect(panel.authored()).toEqual(panel.region);
    expect(panel.mutations).not.toHaveBeenCalled();
  }
);

it.each(['perspectiveX', 'depthWidth'])(
  'commits %s text once on Enter without focusing the next exact field',
  async (name) => {
    const panel = mountSpatialDraftPanel();
    const field = panel.input(name);
    act(() => field.focus());
    await act(async () => setInputValue(field, '45'));
    expect(panel.authored()).toEqual(panel.region);
    await act(async () =>
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(panel.mutations).toHaveBeenCalledTimes(1);
    expect(
      name === 'perspectiveX'
        ? panel.authored().perspective?.rotateX
        : panel.authored().depthOfField?.width
    ).toBe(name === 'perspectiveX' ? 45 : 0.45);
    expect(panel.input(name).value).toBe('45');
    expect(document.activeElement).toBe(document.body);
  }
);
