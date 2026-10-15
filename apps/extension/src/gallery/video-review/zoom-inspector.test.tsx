// @vitest-environment jsdom
import { act, useContext } from 'react';
import { ReviewSpatialToolContext } from './spatial-controls';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomInspector, ReviewZoomLinkInspector } from './zoom-inspector';
import { ReviewSpotlightInspector } from './spotlight-inspector';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';

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

const region: QuickEditZoomRegion = {
  id: 'zoom-1',
  start: 2,
  end: 4,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
};

const field = (label: string) => host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

it('shares disposable tool navigation between the preview and exact fields', () => {
  const onChange = vi.fn();
  function PreviewTools() {
    const selection = useContext(ReviewSpatialToolContext)!;
    return <button onClick={() => selection.onTool('rotation')}>Rotate preview</button>;
  }
  act(() =>
    root.render(
      <ReviewZoomInspector
        region={region}
        onChange={onChange}
        onReset={vi.fn()}
        onDelete={vi.fn()}
        preview={<PreviewTools />}
      />
    )
  );
  expect(field('gallery.videoReview.zoomScale')).not.toBeNull();
  act(() =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Rotate preview')!
      .click()
  );
  expect(field('gallery.videoReview.zoomScale')).toBeNull();
  expect(field('gallery.videoReview.perspectiveZ')).not.toBeNull();
  expect(field('gallery.videoReview.perspectiveX')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

const type = async (node: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const commit = async (node: HTMLInputElement) => {
  await act(async () => {
    node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
};

function renderInspector(
  onChange: (patch: QuickEditZoomRegionPatch) => void,
  onReset = vi.fn(),
  onDelete = vi.fn()
) {
  act(() => {
    root.render(
      <ReviewZoomInspector
        region={region}
        onChange={onChange}
        onReset={onReset}
        onDelete={onDelete}
      />
    );
  });
  return {
    field,
    type,
    commit,
    select: (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!,
  };
}

it('keeps intermediate typed drafts local and clamps a blank commit to the row minimum', async () => {
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const inspector = renderInspector(change);
  const scale = inspector.field('gallery.videoReview.zoomScale');
  await inspector.type(scale, 'not-a-number');
  await inspector.commit(scale);
  expect(change).not.toHaveBeenCalled();
  // The shared field treats a blank draft as zero and clamps into the row range.
  await inspector.type(scale, '');
  await inspector.commit(scale);
  expect(change).toHaveBeenLastCalledWith({ scale: 1 });
  await inspector.type(scale, '2');
  // Typed digits stay in the draft; the commit boundary is blur/Enter.
  await inspector.commit(scale);
  expect(change).toHaveBeenLastCalledWith({ scale: 2 });
});

it('commits percent-mapped focus fields and dedupes a repeated commit', async () => {
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const inspector = renderInspector(change);
  const focusX = inspector.field('gallery.videoReview.zoomFocusX');
  // Stored 0.5 is displayed in percent.
  expect(focusX.value).toBe('50');
  await inspector.type(focusX, '20');
  await inspector.commit(focusX);
  expect(change).toHaveBeenLastCalledWith({ centerX: 0.2 });
  await inspector.type(focusX, '20');
  await inspector.commit(focusX);
  expect(change).toHaveBeenCalledTimes(1);
  const focusY = inspector.field('gallery.videoReview.zoomFocusY');
  await inspector.type(focusY, '80');
  await inspector.commit(focusY);
  expect(change).toHaveBeenLastCalledWith({ centerY: 0.8 });
});

it('edits transition type and duration in separate enter/exit sections', async () => {
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const inspector = renderInspector(change);
  const typeIn = host.querySelector<HTMLButtonElement>(
    'fieldset[aria-label$="zoomTransitionIn"] [aria-label$="zoomTransitionType"] button[title$="transitionLinear"]'
  )!;
  const typeOut = host.querySelector<HTMLButtonElement>(
    'fieldset[aria-label$="zoomTransitionOut"] [aria-label$="zoomTransitionType"] button[title$="transitionLinear"]'
  )!;
  expect(typeIn).not.toBe(typeOut);
  await act(async () => typeIn.click());
  expect(change).toHaveBeenLastCalledWith({ enter: { type: 'linear', duration: 0.3 } });
  const durationIn = host.querySelector<HTMLInputElement>(
    'fieldset[aria-label$="zoomTransitionIn"] input[aria-label$="zoomTransitionDuration"]'
  )!;
  await inspector.type(durationIn, '0.5');
  await inspector.commit(durationIn);
  expect(change).toHaveBeenLastCalledWith({ enter: { type: 'ease-in-out', duration: 0.5 } });
  const durationOut = host.querySelector<HTMLInputElement>(
    'fieldset[aria-label$="zoomTransitionOut"] input[aria-label$="zoomTransitionDuration"]'
  )!;
  await inspector.type(durationOut, '1');
  await inspector.commit(durationOut);
  expect(change).toHaveBeenLastCalledWith({ exit: { type: 'ease-in-out', duration: 1 } });
});

it('keeps reset and delete on their callbacks', async () => {
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const reset = vi.fn();
  const remove = vi.fn();
  renderInspector(change, reset, remove);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomResetPosition"]')!
      .click()
  );
  expect(reset).toHaveBeenCalledOnce();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomDelete"]')!.click()
  );
  expect(remove).toHaveBeenCalledOnce();
});

it('edits link easing, shows the derived gap duration, and removes explicitly', async () => {
  const source: QuickEditZoomRegion = {
    ...region,
    id: 'a',
    start: 0,
    end: 2,
    linkTo: 'b',
  };
  const target: QuickEditZoomRegion = { ...region, id: 'b', start: 4, end: 6 };
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const remove = vi.fn();
  act(() => {
    root.render(
      <ReviewZoomLinkInspector link={{ source, target }} onChange={change} onRemove={remove} />
    );
  });
  const panel = host.querySelector('[data-ui="gallery.videoReview.zoomLinkInspector"]')!;
  expect(panel.textContent).toContain('2.0');
  const easing = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.zoomLinkEasing"] button[title="gallery.videoReview.transitionLinear"]'
  )!;
  await act(async () => easing.click());
  expect(change).toHaveBeenLastCalledWith({ linkEasing: 'linear' });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomLinkRemove"]')!
      .click()
  );
  expect(remove).toHaveBeenCalledOnce();
});

it('keeps spotlight settings when the active type is selected again', async () => {
  const { createQuickEditSpotlight } = await import('../../features/video/review/advanced/focus');
  const change = vi.fn();
  await act(async () =>
    root.render(
      <ReviewZoomInspector
        region={{ ...region, spotlight: { ...createQuickEditSpotlight(), strength: 0.4 } }}
        onChange={change}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const group = host.querySelector('[data-ui="gallery.videoReview.focusType"]')!;
  expect(group.getAttribute('aria-label')).toBe('gallery.videoReview.focusType');
  expect(group.querySelectorAll('button')).toHaveLength(3);
  const active = group.querySelector<HTMLButtonElement>(
    '[title="gallery.videoReview.focusSpotlight"]'
  )!;
  expect(active.getAttribute('aria-pressed')).toBe('true');
  await act(async () => active.click());
  expect(change).not.toHaveBeenCalled();
});

it('edits spotlight strength, area, reveal, rounding and blur through shared controls', async () => {
  const { createQuickEditSpotlight } = await import('../../features/video/review/advanced/focus');
  let spotlight = createQuickEditSpotlight();
  const change = vi.fn((patch: QuickEditZoomRegionPatch) => {
    if (patch.spotlight) spotlight = patch.spotlight;
    render();
  });
  const render = () =>
    root.render(
      <ReviewZoomInspector
        region={{ ...region, spotlight }}
        onChange={change}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    );
  await act(async () => render());
  for (const [label, value] of [
    ['focusStrength', '40'],
    ['focusAreaX', '10'],
    ['focusAreaY', '20'],
    ['focusAreaWidth', '60'],
    ['focusAreaHeight', '70'],
    ['focusRoundness', '12'],
  ] as const) {
    await type(field(`gallery.videoReview.${label}`), value);
    await commit(field(`gallery.videoReview.${label}`));
  }
  expect(spotlight).toMatchObject({
    strength: 0.4,
    roundness: 0.12,
    area: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
  });
  const choose = async (label: string, option: string, phase?: string) => {
    const section = phase
      ? host.querySelector(`fieldset[aria-label="gallery.videoReview.${phase}"]`)!
      : host;
    if (label === 'focusReveal') {
      await act(async () =>
        section.querySelector<HTMLButtonElement>(`[title="gallery.videoReview.${option}"]`)!.click()
      );
      return;
    }
    await act(async () =>
      section
        .querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${label}"]`)!
        .click()
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((node) => node.textContent?.includes(`gallery.videoReview.${option}`))!
        .click()
    );
  };
  expect(host.querySelector<HTMLDetailsElement>('details[data-level="group"]')?.open).toBe(false);
  await choose('focusReveal', 'focusContract', 'zoomTransitionIn');
  expect(spotlight.exitReveal).toBe('fade');
  await choose('focusReveal', 'focusExpand', 'zoomTransitionOut');
  expect(spotlight.exitReveal).toBe('contract');
  await choose('focusOutside', 'focusBlur');
  await type(field('gallery.videoReview.focusBlurRadius'), '8');
  await commit(field('gallery.videoReview.focusBlurRadius'));
  expect(spotlight).toMatchObject({ effect: 'blur', blur: 8, reveal: 'contract' });
});

it('bounds the transition slider and typed duration by the other phase', async () => {
  const change = vi.fn();
  renderInspector(change);
  const phase = host.querySelector('fieldset')!;
  expect(phase.querySelector('input[type="range"]')?.getAttribute('max')).toBe('1.7');
  const duration = phase.querySelector<HTMLInputElement>('input')!;
  await type(duration, '12');
  await commit(duration);
  expect(change).toHaveBeenLastCalledWith({ enter: { type: 'ease-in-out', duration: 1.7 } });
});

it('distinguishes compact nested position from collapsible top-level sections', () => {
  renderInspector(vi.fn());
  const nested = host.querySelector('details[data-level="group"]');
  expect(nested).not.toBeNull();
  expect(nested?.querySelector('summary h4')?.textContent).toBe(
    'gallery.videoReview.precisePosition'
  );
  const parents = host.querySelectorAll('details[data-level="section"]');
  expect(parents.length).toBeGreaterThanOrEqual(2);
  expect([...parents].every((node) => node.hasAttribute('open'))).toBe(true);
});

it('switches directly between Zoom and Spotlight without resetting the camera', async () => {
  const change = vi.fn();
  const render = async (value: QuickEditZoomRegion) =>
    act(async () =>
      root.render(
        <ReviewZoomInspector
          region={value}
          onChange={change}
          onReset={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    );
  await render(region);
  const choose = async (title: string) =>
    act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[data-ui="gallery.videoReview.focusType"] [title="${title}"]`
        )!
        .click()
    );
  await choose('gallery.videoReview.focusSpotlight');
  expect(change).toHaveBeenCalledOnce();
  const patch: QuickEditZoomRegionPatch = change.mock.calls[0]![0];
  expect(patch.spotlight).toMatchObject({ area: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
  expect(patch).not.toHaveProperty('scale');
  expect(patch).not.toHaveProperty('centerX');
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  await render({ ...region, spotlight: patch.spotlight! });
  await choose('gallery.videoReview.zoomRegionLabel');
  expect(change).toHaveBeenLastCalledWith({ spotlight: null, border: null });
});

it('offers five source seconds on the slider and retains valid longer typed phases', async () => {
  const change = vi.fn();
  const long = { ...region, start: 0, end: 10, sourceAnchor: { start: 0, end: 20 } };
  await act(async () =>
    root.render(
      <ReviewZoomInspector region={long} onChange={change} onReset={vi.fn()} onDelete={vi.fn()} />
    )
  );
  const phase = host.querySelector('fieldset')!;
  expect(phase.querySelector('input[type="range"]')?.getAttribute('max')).toBe('5');
  const duration = phase.querySelector<HTMLInputElement>('input')!;
  await type(duration, '12');
  await commit(duration);
  expect(change).toHaveBeenLastCalledWith({ enter: { type: 'ease-in-out', duration: 12 } });
});

it('displays fitted legacy phases without emitting a persistence change on mount', async () => {
  const change = vi.fn();
  const legacy = {
    ...region,
    enter: { type: 'linear' as const, duration: 4 },
    exit: { type: 'linear' as const, duration: 2 },
  };
  await act(async () =>
    root.render(
      <ReviewZoomInspector region={legacy} onChange={change} onReset={vi.fn()} onDelete={vi.fn()} />
    )
  );
  const phases = host.querySelectorAll('fieldset');
  expect(Number(phases[0]!.querySelector<HTMLInputElement>('input')!.value)).toBeCloseTo(1.33);
  expect(Number(phases[1]!.querySelector<HTMLInputElement>('input')!.value)).toBeCloseTo(0.67);
  expect(change).not.toHaveBeenCalled();
  expect(legacy.enter.duration).toBe(4);
});

it('updates the opposite fractional budget live and keeps fitted values unchanged on blur', async () => {
  const { updateQuickEditZoomRegion, fitQuickEditZoomTransitions } =
    await import('../../features/video/review/advanced/zoom');
  let current = { ...region, start: 0, end: 0.6 };
  let preview: QuickEditZoomRegion | undefined;
  const render = () =>
    root.render(
      <ReviewZoomInspector
        region={current}
        {...(preview ? { spatialPreview: preview } : {})}
        onPreview={(patch) => {
          preview = patch ? updateQuickEditZoomRegion([current], current.id, patch)[0]! : undefined;
          render();
        }}
        onChange={change}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    );
  const change = vi.fn((patch: QuickEditZoomRegionPatch) => {
    current = updateQuickEditZoomRegion([current], current.id, patch)[0]!;
    render();
  });
  await act(async () => render());
  const ranges = () => [...host.querySelectorAll<HTMLInputElement>('fieldset input[type="range"]')];
  await type(ranges()[0]!, '0.17');
  expect(current.enter.duration).toBe(0.3);
  expect(preview?.enter.duration).toBe(0.17);
  expect(change).not.toHaveBeenCalled();
  expect(current.exit.duration).toBe(0.3);
  expect(Number(ranges()[1]!.max)).toBeCloseTo(0.43);
  expect(
    Number.parseFloat(ranges()[1]!.style.getPropertyValue('--sniptale-range-fill-ratio'))
  ).toBeCloseTo((0.3 / 0.43) * 100);
  await act(async () => ranges()[0]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  expect(current.enter.duration).toBe(0.17);
  await type(ranges()[1]!, '0.42');
  expect(current.exit.duration).toBe(0.3);
  expect(preview?.exit.duration).toBe(0.42);
  expect(current.enter.duration + current.exit.duration).toBeLessThanOrEqual(0.6);
  await act(async () => ranges()[1]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  current = fitQuickEditZoomTransitions({ ...current, end: 0.4 });
  await act(async () => render());
  const before = structuredClone(current);
  change.mockClear();
  await act(async () => ranges()[1]!.focus());
  await act(async () => ranges()[1]!.blur());
  expect(current).toEqual(before);
  expect(change).not.toHaveBeenCalled();
});

it('preserves the source area when switching Spotlight to Border and blocks conflicting Zoom', async () => {
  const { createQuickEditSpotlight } = await import('../../features/video/review/advanced/focus');
  const spotlight = {
    ...createQuickEditSpotlight(),
    roundness: 0.21,
    area: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  };
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewZoomInspector
        region={{ ...region, spotlight }}
        zoomConversionBlocked
        onChange={onChange}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const group = host.querySelector('[data-ui="gallery.videoReview.focusType"]')!;
  const zoom = group.querySelector<HTMLButtonElement>(
    '[title="gallery.videoReview.zoomRegionLabel"]'
  )!;
  expect(zoom.disabled).toBe(true);
  act(() => zoom.click());
  expect(onChange).not.toHaveBeenCalled();
  expect(host.textContent).toContain('gallery.videoReview.focusZoomConflict');
  act(() =>
    group.querySelector<HTMLButtonElement>('[title="gallery.videoReview.focusBorder"]')!.click()
  );
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      spotlight: null,
      border: expect.objectContaining({ area: spotlight.area, roundness: spotlight.roundness }),
      enter: { type: 'ease-in-out', duration: 1 },
      exit: region.exit,
    })
  );
});

it('previews Border width without history writes, commits once, and cancels with Escape', async () => {
  const { ReviewBorderInspector } = await import('./border-inspector');
  const { createQuickEditBorder } = await import('../../features/video/review/advanced/border');
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <ReviewBorderInspector
        value={createQuickEditBorder()}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  const range = field('gallery.videoReview.borderWidth range');
  act(() => range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  await type(range, '5');
  await type(range, '8');
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ border: expect.objectContaining({ width: 8 }) })
  );
  act(() => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ width: 8 }));
  onChange.mockClear();
  act(() => range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  await type(range, '11');
  act(() => range.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreview).toHaveBeenLastCalledWith(null);
});

it('explains why cameras and unresolved placements cannot be copied', () => {
  const duplicate = vi.fn();
  for (const dormant of [false, true]) {
    act(() =>
      root.render(
        <ReviewZoomInspector
          region={{ ...region, dormant }}
          onChange={vi.fn()}
          onReset={vi.fn()}
          onDelete={vi.fn()}
          onDuplicate={duplicate}
        />
      )
    );
    const button = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.focusDuplicate"]'
    )!;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(
      dormant
        ? 'gallery.videoReview.focusDuplicateDormant'
        : 'gallery.videoReview.focusDuplicateZoom'
    );
    act(() => button.click());
  }
  expect(duplicate).not.toHaveBeenCalled();
});

it('configures entrance and exit blur separately, starts disabled and retains the other phase', async () => {
  const change = vi.fn();
  renderInspector(change);
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.motionBlurSettings"]')).toHaveLength(
    2
  );
  expect(host.querySelector('[aria-label="gallery.videoReview.motionBlurStrength"]')).toBeNull();
  const enter = host.querySelector<HTMLButtonElement>(
    '[data-phase="enter"] [aria-label="gallery.videoReview.motionBlur"]'
  )!;
  await act(async () => enter.click());
  expect(change).toHaveBeenLastCalledWith({
    motionBlur: { enter: { enabled: true, strength: 0.5 } },
  });
  const configured = {
    ...region,
    motionBlur: {
      enter: { enabled: true, strength: 0.2 },
      exit: { enabled: false, strength: 0.8 },
    },
  };
  act(() =>
    root.render(
      <ReviewZoomInspector
        region={configured}
        onChange={change}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const exit = host.querySelector<HTMLButtonElement>(
    '[data-phase="exit"] [aria-label="gallery.videoReview.motionBlur"]'
  )!;
  await act(async () => exit.click());
  expect(change).toHaveBeenLastCalledWith({
    motionBlur: { enter: configured.motionBlur.enter, exit: { enabled: true, strength: 0.8 } },
  });
});

it('edits only outgoing link exposure in the selected transition inspector', async () => {
  const change = vi.fn();
  const source = {
    ...region,
    id: 'a',
    end: 4,
    linkTo: 'b',
    motionBlur: { enter: { enabled: true, strength: 0.2 } },
  };
  const target = { ...region, id: 'b', start: 6, end: 9 };
  act(() =>
    root.render(
      <ReviewZoomLinkInspector link={{ source, target }} onChange={change} onRemove={vi.fn()} />
    )
  );
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.motionBlurSettings"]')).toHaveLength(
    1
  );
  const toggle = host.querySelector<HTMLButtonElement>(
    '[data-phase="link"] [aria-label="gallery.videoReview.motionBlur"]'
  )!;
  await act(async () => toggle.click());
  expect(change).toHaveBeenLastCalledWith({
    motionBlur: { enter: source.motionBlur.enter, link: { enabled: true, strength: 0.5 } },
  });
});

it('orders spotlight roundness before precise area and makes both animation phases disclosures', async () => {
  const { createQuickEditSpotlight } = await import('../../features/video/review/advanced/focus');
  await act(async () =>
    root.render(
      <ReviewZoomInspector
        region={{ ...region, spotlight: createQuickEditSpotlight() }}
        onChange={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    )
  );
  const strength = host.querySelector('[aria-label="gallery.videoReview.focusStrength"]')!;
  const roundness = host.querySelector('[aria-label="gallery.videoReview.focusRoundness"]')!;
  const area = [...host.querySelectorAll('summary h4')].find(
    (node) => node.textContent === 'gallery.videoReview.preciseArea'
  )!;
  expect(
    strength.compareDocumentPosition(roundness) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(roundness.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const phases = [...host.querySelectorAll('summary h4')].filter((node) =>
    node.textContent?.includes('zoomTransition')
  );
  expect(phases.map((node) => node.textContent)).toEqual([
    'gallery.videoReview.zoomTransitionIn',
    'gallery.videoReview.zoomTransitionOut',
  ]);
});

it.each([
  ['dim', 'focusStrength', 'strength'],
  ['blur', 'focusBlurRadius', 'blur'],
  ['dim', 'focusRoundness', 'roundness'],
  ['dim', 'focusAreaX', 'area'],
  ['dim', 'focusAreaWidth', 'area'],
] as const)(
  'Spotlight %s %s previews, cancels and accepts independently',
  async (effect, label, target) => {
    const value = { ...createQuickEditSpotlight(), effect };
    const preview = vi.fn();
    const change = vi.fn();
    await act(async () =>
      root.render(<ReviewSpotlightInspector value={value} onPreview={preview} onChange={change} />)
    );
    const range = host.querySelector<HTMLInputElement>(
      `input[type="range"][aria-label^="gallery.videoReview.${label}"]`
    )!;
    const key = (type: string, key: string) =>
      act(() => range.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
    key('keydown', 'ArrowRight');
    expect(preview.mock.lastCall![0].spotlight[target]).not.toEqual(value[target]);
    expect(change).not.toHaveBeenCalled();
    key('keydown', 'Escape');
    key('keyup', 'ArrowRight');
    expect(preview).toHaveBeenLastCalledWith(null);
    expect(change).not.toHaveBeenCalled();
    key('keydown', 'ArrowRight');
    key('keyup', 'ArrowRight');
    expect(change).toHaveBeenCalledOnce();
    expect(change.mock.lastCall![0][target]).not.toEqual(value[target]);
  }
);

it('offers local cursor follow in Position and leaves it unavailable without focus data', async () => {
  const change = vi.fn();
  const props = {
    region,
    onChange: change,
    onReset: vi.fn(),
    onDelete: vi.fn(),
    cursorPath: {
      version: 1 as const,
      smoothing: 0.5,
      sensitivity: 0.5,
      mode: 'fixed' as const,
      gapPolicy: 'hold' as const,
      segments: [
        {
          id: 'path',
          binding: { kind: 'project' as const },
          start: 0,
          end: 6,
          keys: [
            {
              id: 'focus',
              time: 1,
              x: 0.2,
              y: 0.3,
              anchor: 'manual' as const,
              authored: true as const,
              interpolation: 'smooth' as const,
            },
          ],
        },
      ],
    },
  };
  await act(async () => root.render(<ReviewZoomInspector {...props} />));
  const mode = host.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.cursorFocusMode"]'
  );
  expect(mode).not.toBeNull();
  await act(async () => mode!.click());
  const choice =
    document.querySelector<HTMLButtonElement>('[role="option"][data-value="follow"]') ??
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((option) =>
      option.textContent?.includes('videoEditor.sidebar.cursorFocusFollow')
    );
  expect(choice).toBeDefined();
  await act(async () => choice!.click());
  expect(change).toHaveBeenLastCalledWith({ followCursor: true });
  await act(async () =>
    root.render(<ReviewZoomInspector {...props} region={{ ...region, followCursor: true }} />)
  );
  expect(field('gallery.videoReview.zoomFocusX').disabled).toBe(true);
  expect(field('gallery.videoReview.zoomScale').disabled).toBe(false);
  await act(async () =>
    root.render(
      <ReviewZoomInspector {...props} cursorPath={{ ...props.cursorPath, segments: [] }} />
    )
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cursorFocusMode"]')!
      .click()
  );
  const unavailable = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.textContent?.includes('videoEditor.sidebar.cursorFocusFollow')
  );
  expect(unavailable?.disabled).toBe(true);
  await act(async () => unavailable!.click());
  expect(change).toHaveBeenCalledOnce();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cursorFocusMode"]')!
      .click()
  );
  await act(async () =>
    root.render(
      <ReviewZoomInspector
        {...props}
        region={{ ...region, followCursor: true, sourceAnchor: { start: 8, end: 10 } }}
      />
    )
  );
  expect(field('gallery.videoReview.zoomFocusX').disabled).toBe(true);
  expect(host.textContent).toContain('videoEditor.sidebar.cursorFocusUnavailable');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cursorFocusMode"]')!
      .click()
  );
  const outsideInterval = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.textContent?.includes('videoEditor.sidebar.cursorFocusFollow')
  );
  expect(outsideInterval?.disabled).toBe(true);
  expect(change).toHaveBeenCalledOnce();
});
