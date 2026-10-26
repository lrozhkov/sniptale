// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { createDefaultHighlighterSettings } from '../../features/highlighter/style/defaults';
import { AnnotationCreationButtons, FrameStyleCreationButton } from './creation-buttons';
import { FrameAnnotationCreationControls } from './creation-controls';
import type { FrameAnnotationCreationSettings } from './contracts';

let host: HTMLDivElement;
let root: Root;

it('selects effects directly without opening properties and keeps the arrow independent', () => {
  const onChange = vi.fn();
  const onMenuChange = vi.fn();
  act(() =>
    root.render(
      <FrameAnnotationCreationControls
        activeMenu={null}
        context="content"
        settings={createSettings()}
        onChange={onChange}
        onMenuChange={onMenuChange}
      />
    )
  );
  const blur = host.querySelector<HTMLButtonElement>('[data-frame-effect="blur"]');
  expect(blur).not.toBeNull();
  act(() => blur!.click());
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ effectMode: 'blur' }));
  expect(onMenuChange).not.toHaveBeenCalled();
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.future-frame-style.menu"]')!
      .click()
  );
  expect(onMenuChange).toHaveBeenCalledWith('frame');
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('updates content creation chevrons from their popover resolver after viewport changes', () => {
  let side: 'right' | 'left' = 'right';
  const resolveMenuDirection = vi.fn(() => side);
  const settings = createSettings();
  act(() =>
    root.render(
      <FrameAnnotationCreationControls
        context="content"
        onChange={vi.fn()}
        settings={settings}
        {...{ resolveMenuDirection }}
      />
    )
  );
  const triggers = () => host.querySelectorAll('.sniptale-full-page-chevron');
  expect(triggers()).toHaveLength(3);
  for (const trigger of triggers()) expect(trigger.getAttribute('data-menu-side')).toBe('right');
  side = 'left';
  act(() => window.dispatchEvent(new Event('resize')));
  for (const trigger of triggers()) expect(trigger.getAttribute('data-menu-side')).toBe('left');
  expect(resolveMenuDirection.mock.calls.length).toBeGreaterThanOrEqual(6);
});

it('binds frame activity independently from its menu and covers optional annotation buttons', () => {
  const toggle = vi.fn();
  const enableCallout = vi.fn();
  const enableStepBadge = vi.fn();
  const toggleFrame = vi.fn();
  const frameRef = createRef<HTMLButtonElement>();
  const calloutRef = createRef<HTMLButtonElement>();
  const stepBadgeRef = createRef<HTMLButtonElement>();
  const settings = createSettings();

  act(() =>
    root.render(
      <>
        <FrameStyleCreationButton
          activeMenu={null}
          contentContext={false}
          dataUi="editor.frame-group"
          frameActive={false}
          frameRef={frameRef}
          onToggleFrame={toggleFrame}
          settings={{ ...settings, effectMode: 'blur' }}
          toggle={toggle}
        />
        <AnnotationCreationButtons
          activeMenu={null}
          calloutRef={calloutRef}
          contentContext={false}
          onCalloutMenu={() => toggle('callout')}
          onStepBadgeMenu={() => toggle('step-badge')}
          onToggleCallout={enableCallout}
          onToggleStepBadge={enableStepBadge}
          settings={settings}
          showCallout={false}
          showStepBadge={false}
          stepBadgeRef={stepBadgeRef}
        />
      </>
    )
  );

  expect(
    host.querySelector('[data-ui="frame-annotation.creation.frame"]')?.getAttribute('aria-pressed')
  ).toBe('false');
  expect(host.querySelector('[data-ui="editor.frame-group"]')).not.toBeNull();
  expect(calloutRef.current).toBeNull();
  expect(stepBadgeRef.current).toBeNull();

  act(() =>
    root.render(
      <>
        <FrameStyleCreationButton
          activeMenu="frame"
          contentContext={false}
          frameActive
          frameRef={frameRef}
          onToggleFrame={toggleFrame}
          settings={{ ...settings, effectMode: 'focus' }}
          toggle={toggle}
        />
        <AnnotationCreationButtons
          activeMenu="callout"
          calloutRef={calloutRef}
          contentContext={false}
          onCalloutMenu={() => toggle('callout')}
          onStepBadgeMenu={() => toggle('step-badge')}
          onToggleCallout={enableCallout}
          onToggleStepBadge={enableStepBadge}
          settings={{
            ...settings,
            callout: createDefaultFrameCallout(),
            stepBadge: createDefaultFrameStepBadge(),
          }}
          showCallout
          showStepBadge
          stepBadgeRef={stepBadgeRef}
        />
      </>
    )
  );

  expect(
    host.querySelector('[data-ui="frame-annotation.creation.frame"]')?.getAttribute('aria-pressed')
  ).toBe('true');
  act(() => {
    host.querySelector<HTMLButtonElement>('[data-ui="frame-annotation.creation.frame"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-ui="frame-annotation.creation.callout"]')?.click();
    host
      .querySelector<HTMLButtonElement>('[data-ui="frame-annotation.creation.step-badge"]')
      ?.click();
    frameRef.current?.click();
    calloutRef.current?.click();
    stepBadgeRef.current?.click();
  });
  expect(toggleFrame).toHaveBeenCalledOnce();
  expect(enableCallout).toHaveBeenCalledOnce();
  expect(enableStepBadge).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledWith('frame');
  expect(toggle).toHaveBeenCalledWith('callout');
  expect(toggle).toHaveBeenCalledWith('step-badge');
});

it('closes the frame menu when the frame tool becomes inactive', () => {
  const settings = createSettings();
  const renderControls = (frameActive: boolean) => (
    <FrameAnnotationCreationControls
      frameActive={frameActive}
      onChange={vi.fn()}
      renderFramePopover={({ isOpen }) => (isOpen ? <div data-ui="mock.frame-popover" /> : null)}
      settings={settings}
      showCallout={false}
      showStepBadge={false}
    />
  );

  act(() => root.render(renderControls(true)));
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="frame-annotation.creation.frame.menu"]')
      ?.click()
  );
  expect(host.querySelector('[data-ui="mock.frame-popover"]')).not.toBeNull();

  act(() => root.render(renderControls(false)));
  expect(host.querySelector('[data-ui="mock.frame-popover"]')).toBeNull();
  expect(
    host
      .querySelector<HTMLButtonElement>('[data-ui="frame-annotation.creation.frame.menu"]')
      ?.getAttribute('aria-expanded')
  ).toBe('false');
});

it('opens an inactive annotation menu without enabling its value', () => {
  const onChange = vi.fn();
  const settings = createSettings();

  act(() =>
    root.render(
      <FrameAnnotationCreationControls
        enableCallout={createDefaultFrameCallout}
        enableStepBadge={createDefaultFrameStepBadge}
        onChange={onChange}
        settings={settings}
      />
    )
  );

  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="frame-annotation.creation.callout.menu"]')
      ?.click()
  );

  expect(onChange).toHaveBeenCalledWith({
    ...settings,
    callout: expect.objectContaining({ enabled: false }),
  });
  expect(
    host
      .querySelector('[data-ui="frame-annotation.creation.callout"]')
      ?.getAttribute('aria-pressed')
  ).toBe('false');
});

function createSettings(): FrameAnnotationCreationSettings {
  const defaults = createDefaultHighlighterSettings();
  return {
    blurSettings: defaults.defaultBlurSettings,
    borderSettings: defaults.borderPresets[0]!,
    callout: null,
    effectMode: 'border',
    focusSettings: defaults.defaultFocusSettings,
    stepBadge: null,
  };
}

it('places page controls independently and retains editor grouping by default', () => {
  act(() =>
    root.render(
      <FrameAnnotationCreationControls
        context="content"
        activeMenu={null}
        settings={createSettings()}
        onChange={vi.fn()}
        groupAnnotations={false}
        renderFrameControl={(control) => <div data-frame-slot>{control}</div>}
      />
    )
  );
  expect(
    host.querySelector('[data-frame-slot] [data-ui="content.toolbar.future-frame-style"]')
  ).not.toBeNull();
  expect(host.querySelector('.sniptale-toolbar-annotation-group')).toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.future-frame-callout"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.future-frame-step-badge"]')).not.toBeNull();
  act(() =>
    root.render(<FrameAnnotationCreationControls settings={createSettings()} onChange={vi.fn()} />)
  );
  expect(host.querySelector('.sniptale-toolbar-annotation-group')).not.toBeNull();
});
