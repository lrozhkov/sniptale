// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewSpatialInspector } from './spatial-inspector';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { DEFAULT_QUICK_EDIT_PERSPECTIVE } from '../../features/video/review/advanced/spatial';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const hosts: HTMLElement[] = [];
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
  vi.unstubAllGlobals();
});

it('starts collapsed and marks enabled settings without modifying the document', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  const onChange = vi.fn();
  const region = {
    ...createQuickEditZoomRegion({ id: 'zoom', at: 0 }),
    perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: 35 },
  };
  act(() => root.render(<ReviewSpatialInspector region={region} onChange={onChange} />));
  const groups = host.querySelectorAll('details');
  expect(groups).toHaveLength(2);
  expect([...groups].every((group) => !group.open)).toBe(true);
  expect(groups[0]?.querySelector('summary')?.textContent).toContain(
    'gallery.videoReview.spatialOn'
  );
  expect(groups[1]?.querySelector('summary')?.textContent).not.toContain(
    'gallery.videoReview.spatialOn'
  );
  expect(onChange).not.toHaveBeenCalled();
  const reset = [...groups[0]!.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === 'gallery.videoReview.spatialReset'
  )!;
  act(() => reset.click());
  expect(onChange).toHaveBeenCalledWith({ perspective: DEFAULT_QUICK_EDIT_PERSPECTIVE });
});

it.each(['pointerup', 'pointercancel', 'Escape'])(
  'shows a scrub draft and handles %s without leaking intermediate edits',
  async (finish) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    const onChange = vi.fn(),
      onPreview = vi.fn();
    const region = {
      ...createQuickEditZoomRegion({ id: 'gesture', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: 20 },
    };
    act(() =>
      root.render(
        <ReviewSpatialInspector region={region} onChange={onChange} onPreview={onPreview} />
      )
    );
    const field = host.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.videoReview.perspectiveY"]'
    )!;
    const slider = host.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.videoReview.perspectiveY range"]'
    )!;
    act(() => slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '40');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(field.value).toContain('40');
    expect(
      field.closest('[data-ui="shared.ui.compact-inspector.numeric-row"]')?.textContent
    ).toContain('°');
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith({
      perspective: { ...region.perspective, rotateY: 40 },
    });
    act(() => {
      if (finish === 'Escape')
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      slider.dispatchEvent(
        new MouseEvent(finish === 'pointercancel' ? finish : 'pointerup', { bubbles: true })
      );
    });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    if (finish === 'pointerup') {
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        perspective: { ...region.perspective, rotateY: 40 },
      });
    } else {
      expect(onChange).not.toHaveBeenCalled();
      expect(field.value).toContain('20');
    }
  }
);

it('edits depth mode, focus area and strength through the existing unit fields', async () => {
  const { DEFAULT_QUICK_EDIT_DEPTH } = await import('../../features/video/review/advanced/spatial');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  const onChange = vi.fn(),
    onPreview = vi.fn();
  const region = {
    ...createQuickEditZoomRegion({ id: 'depth', at: 0 }),
    perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true },
    depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true },
  };
  act(() =>
    root.render(
      <ReviewSpatialInspector region={region} onChange={onChange} onPreview={onPreview} />
    )
  );
  const groups = host.querySelectorAll('details');
  const choose = async (scope: ParentNode, label: string, option: string) => {
    await act(async () =>
      scope
        .querySelector<HTMLButtonElement>(`button[aria-label="gallery.videoReview.${label}"]`)!
        .click()
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((node) => node.textContent === `gallery.videoReview.${option}`)!
        .click()
    );
  };
  await choose(groups[0]!, 'spatialEnabled', 'motionBlurOff');
  expect(onChange).toHaveBeenLastCalledWith({
    perspective: { ...region.perspective, enabled: false },
  });
  await choose(groups[1]!, 'spatialEnabled', 'motionBlurOff');
  expect(onChange).toHaveBeenLastCalledWith({
    depthOfField: { ...region.depthOfField, enabled: false },
  });
  await choose(groups[1]!, 'depthMode', 'depthModeArea');
  expect(onChange).toHaveBeenLastCalledWith({
    depthOfField: { ...region.depthOfField, mode: 'area' },
  });
  for (const [name, key] of [
    ['depthX', 'x'],
    ['depthY', 'y'],
    ['depthWidth', 'width'],
    ['depthSoftness', 'softness'],
    ['depthStrength', 'strength'],
  ] as const) {
    const slider = host.querySelector<HTMLInputElement>(
      `input[aria-label="gallery.videoReview.${name} range"]`
    )!;
    act(() => slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '60');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreview).toHaveBeenLastCalledWith({
      depthOfField: { ...region.depthOfField, [key]: 0.6 },
    });
    act(() => slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(onChange).toHaveBeenLastCalledWith({
      depthOfField: { ...region.depthOfField, [key]: 0.6 },
    });
  }
  act(() =>
    groups[1]!
      .querySelector<HTMLButtonElement>('button[aria-label="gallery.videoReview.spatialReset"]')!
      .click()
  );
  expect(onChange).toHaveBeenLastCalledWith({ depthOfField: DEFAULT_QUICK_EDIT_DEPTH });
});
