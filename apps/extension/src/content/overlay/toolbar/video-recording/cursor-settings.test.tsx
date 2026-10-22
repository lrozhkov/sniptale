// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_CURSOR_EFFECTS } from '@sniptale/runtime-contracts/video/types/types';
import type { ColorField } from '../../../../ui/compact-inspector-controls';
import { RecordingCursorSettingsPanel } from './cursor-settings';

const { colorField } = vi.hoisted(() => ({
  colorField: vi.fn<(props: ComponentProps<typeof ColorField>) => void>(),
}));
vi.mock('../../../../ui/compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/compact-inspector-controls')>()),
  ColorField: (props: ComponentProps<typeof ColorField>) => {
    colorField(props);
    return null;
  },
}));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  colorField.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each(['#2563eb80', '#2563eb00', '#2563eb'])(
  'edits halo alpha through the shared picker as one color channel: %s',
  (color) => {
    const onChange = vi.fn();
    const settings = {
      cursorHaloEnabled: true,
      cursorDimmingEnabled: false,
      clickAnimationEnabled: false,
      cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloColor: '#112233', haloOpacity: 50 },
    };
    act(() => {
      root.render(
        <RecordingCursorSettingsPanel
          disabled={false}
          settings={settings}
          onChange={onChange}
          onPreview={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });
    act(() => host.querySelectorAll<HTMLButtonElement>('nav button')[1]!.click());
    const props = colorField.mock.calls.at(-1)![0];
    expect(props.value).toBe('#11223380');
    expect(props.allowAlpha).toBe(true);
    expect(props.floatingPlacement).toBe('auto');
    expect(props.floatingBoundaryRef).toBeUndefined();
    expect(host.textContent).not.toContain('content.toolbar.cursorEffectOpacity');
    expect(onChange).not.toHaveBeenCalled();
    act(() => props.onChange(color));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...settings,
      cursorEffects: { ...settings.cursorEffects, haloColor: color, haloOpacity: 100 },
    });
    expect(settings.cursorEffects.haloOpacity).toBe(50);
  }
);

it('edits click alpha without resetting the independent halo multiplier', () => {
  const onChange = vi.fn();
  const settings = {
    cursorHaloEnabled: true,
    cursorDimmingEnabled: false,
    clickAnimationEnabled: true,
    cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloOpacity: 50, clickColor: '#ef444466' },
  };
  act(() => {
    root.render(
      <RecordingCursorSettingsPanel
        disabled={false}
        settings={settings}
        onChange={onChange}
        onPreview={vi.fn()}
        onClose={vi.fn()}
      />
    );
  });
  act(() => host.querySelectorAll<HTMLButtonElement>('nav button')[0]!.click());
  const props = colorField.mock.calls.at(-1)![0];
  expect(props.allowAlpha).toBe(true);
  expect(props.value).toBe('#ef444466');
  expect(onChange).not.toHaveBeenCalled();
  act(() => props.onChange('#ef444400'));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    ...settings,
    cursorEffects: { ...settings.cursorEffects, clickColor: '#ef444400' },
  });
});

it.each([false, true])('keeps category switches in the heading with disabled=%s', (disabled) => {
  const onChange = vi.fn();
  const settings = {
    cursorHaloEnabled: true,
    cursorDimmingEnabled: false,
    clickAnimationEnabled: true,
  };
  act(() => {
    root.render(
      <RecordingCursorSettingsPanel
        disabled={disabled}
        settings={settings}
        onChange={onChange}
        onPreview={vi.fn()}
        onClose={vi.fn()}
      />
    );
  });
  for (const [index, key] of [
    [0, 'clickAnimationEnabled'],
    [1, 'cursorHaloEnabled'],
    [2, 'cursorDimmingEnabled'],
  ] as const) {
    act(() => host.querySelectorAll<HTMLButtonElement>('nav button')[index]!.click());
    const heading = host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!;
    const toggle = heading.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle).not.toBeNull();
    expect(host.querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(toggle.disabled).toBe(disabled);
    expect(toggle.getAttribute('aria-checked')).toBe(String(settings[key]));
    expect(toggle.getAttribute('aria-label')).toBe(heading.querySelector('span')!.textContent);
    expect(host.textContent).not.toContain('content.toolbar.cursorEffectEnabled');
    onChange.mockClear();
    act(() => toggle.click());
    if (disabled) expect(onChange).not.toHaveBeenCalled();
    else expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, [key]: !settings[key] });
  }
  act(() => host.querySelectorAll<HTMLButtonElement>('nav button')[3]!.click());
  expect(host.querySelector('[role="switch"]')).toBeNull();
});
