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

it.each(['tilt', 'rotation', 'focus'] as const)(
  'shows only the selected %s fields without Apply or document mutation',
  (tool) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    const onChange = vi.fn();
    const region = createQuickEditZoomRegion({ id: 'zoom', at: 0 });
    act(() =>
      root.render(<ReviewSpatialInspector tool={tool} region={region} onChange={onChange} />)
    );
    expect(host.querySelector('[aria-label="gallery.videoReview.spatialEnabled"]')).toBeNull();
    expect(!!host.querySelector('input[aria-label="gallery.videoReview.perspectiveX"]')).toBe(
      tool === 'tilt'
    );
    expect(!!host.querySelector('input[aria-label="gallery.videoReview.perspectiveZ"]')).toBe(
      tool === 'rotation'
    );
    expect(!!host.querySelector('input[aria-label="gallery.videoReview.depthStrength"]')).toBe(
      tool === 'focus'
    );
    expect(onChange).not.toHaveBeenCalled();
  }
);

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
        <ReviewSpatialInspector
          tool="tilt"
          region={region}
          onChange={onChange}
          onPreview={onPreview}
        />
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

it.each(['tilt', 'rotation', 'focus'] as const)(
  'enables %s with a changed number, but not an unchanged Enter',
  async (tool) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    const onChange = vi.fn();
    const region = createQuickEditZoomRegion({ id: 'disabled', at: 0 });
    act(() =>
      root.render(<ReviewSpatialInspector tool={tool} region={region} onChange={onChange} />)
    );
    const name =
      tool === 'focus' ? 'depthStrength' : tool === 'tilt' ? 'perspectiveX' : 'perspectiveZ';
    const input = host.querySelector<HTMLInputElement>(
      `input[aria-label="gallery.videoReview.${name}"]`
    )!;
    const enter = () =>
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    act(() => input.focus());
    enter();
    expect(onChange).not.toHaveBeenCalled();
    act(() => input.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '35');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    enter();
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0]![0];
    expect(tool === 'focus' ? patch.depthOfField.enabled : patch.perspective.enabled).toBe(true);
    expect(document.activeElement).not.toBe(input);
  }
);

it('edits focus area and strength through the existing unit fields', async () => {
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
      <ReviewSpatialInspector
        tool="focus"
        region={region}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
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
});

it.each([
  ['perspectiveY', 'perspectiveX', 'perspective', 'rotateY', 35],
  ['depthWidth', 'depthSoftness', 'depthOfField', 'width', 0.35],
] as const)(
  'accepts %s once on Enter, clears its preview and leaves numeric editing',
  async (label, nextLabel, group, key, expected) => {
    const { DEFAULT_QUICK_EDIT_DEPTH } =
      await import('../../features/video/review/advanced/spatial');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    const onChange = vi.fn();
    const onPreview = vi.fn();
    const region = {
      ...createQuickEditZoomRegion({ id: 'precise', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true },
      depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true },
    };
    act(() =>
      root.render(
        <ReviewSpatialInspector
          tool={group === 'perspective' ? 'tilt' : 'focus'}
          region={region}
          onChange={onChange}
          onPreview={onPreview}
        />
      )
    );
    const field = host.querySelector<HTMLInputElement>(
      `input[aria-label="gallery.videoReview.${label}"]`
    )!;
    const next = host.querySelector<HTMLInputElement>(
      `input[aria-label="gallery.videoReview.${nextLabel}"]`
    )!;
    act(() => field.focus());
    expect(document.activeElement).toBe(field);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '35');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      [group]: { ...region[group], [key]: expected },
    });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(document.activeElement).not.toBe(field);
    expect(document.activeElement).not.toBe(next);
    expect(host.contains(document.activeElement)).toBe(false);
    act(() => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onChange).toHaveBeenCalledTimes(1);
  }
);
