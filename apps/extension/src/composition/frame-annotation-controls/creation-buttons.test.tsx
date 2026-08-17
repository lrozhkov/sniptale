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
