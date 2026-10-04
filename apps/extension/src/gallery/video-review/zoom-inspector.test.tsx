// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomInspector, ReviewZoomLinkInspector } from './zoom-inspector';
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
    'fieldset[aria-label$="zoomTransitionIn"] button[aria-label$="zoomTransitionType"]'
  )!;
  const typeOut = host.querySelector<HTMLButtonElement>(
    'fieldset[aria-label$="zoomTransitionOut"] button[aria-label$="zoomTransitionType"]'
  )!;
  expect(typeIn).not.toBe(typeOut);
  await act(async () => typeIn.click());
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click()
  );
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
    '[aria-label="gallery.videoReview.zoomLinkEasing"]'
  )!;
  await act(async () => easing.click());
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click()
  );
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
  expect(group.querySelectorAll('button')).toHaveLength(2);
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
  expect(change).toHaveBeenLastCalledWith({ spotlight: null });
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
  expect(host.textContent).toContain('gallery.videoReview.zoomSourceTimingHint');
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
