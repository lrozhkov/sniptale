// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => (key === 'content.stepBadge.tooltipPrefix' ? 'Step' : key),
}));

import { StepBadge } from '.';
import { FrameStepBadgeInteractiveSurface } from '../../../features/highlighter/frame-annotation/step-badge/interactive-surface';
import { createStepBadgeSettingsFixture } from '../frame-runtime/test-support';
import { initializeContentUiRoots, resolveContentOverlayRoot } from '../../platform/dom-host';

it('renders the tooltip label through the shared i18n seam', () => {
  const markup = renderToStaticMarkup(
    <StepBadge
      settings={createStepBadgeSettingsFixture({ value: '7' })}
      borderColor="#000"
      borderWidth={2}
    />
  );

  expect(markup).toContain('title="Step 7"');
  expect(markup).toContain('z-index:2147483645');
});

it('keeps an enabled badge mounted when its manual value is empty', () => {
  const markup = renderToStaticMarkup(
    <StepBadge
      settings={createStepBadgeSettingsFixture({ auto: false, value: '' })}
      borderColor="#000"
      borderWidth={2}
    />
  );

  expect(markup).toContain('class="sniptale-step-badge"');
  expect(markup).toContain('title="Step"');
});

it('renders hover-only move and settings controls for an enabled badge', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
        isSettingsOpen
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle
      />
    );
  });

  expect(document.querySelector('.sniptale-step-badge-move-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  expect(document.querySelector('.sniptale-step-badge-settings-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  const controls = document.querySelector<HTMLElement>('.sniptale-step-badge-controls');
  const controlsPositioner = controls?.parentElement;
  const moveHandle = controls?.querySelector<HTMLElement>('.sniptale-step-badge-move-handle');
  const settingsHandle = controls?.querySelector<HTMLElement>(
    '.sniptale-step-badge-settings-handle'
  );
  expect(moveHandle?.style.width).toBe('26px');
  expect(moveHandle?.querySelector('.lucide-move')).not.toBeNull();
  expect(moveHandle?.querySelector('.lucide-grip-vertical')).toBeNull();
  expect(settingsHandle?.style.width).toBe('26px');
  expect(controlsPositioner?.style.zIndex).toBe('2147483645');
  expect(controls?.classList).toContain('sniptale-content-ui-zoom-surface');

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('keeps closed controls keyboard-reachable and reveals them on focus', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSettingsClick = vi.fn();

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
        onPositionChange={vi.fn()}
        onSettingsClick={onSettingsClick}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle
      />
    );
  });

  const moveHandle = document.querySelector<HTMLButtonElement>('.sniptale-step-badge-move-handle');
  const settingsHandle = document.querySelector<HTMLButtonElement>(
    '.sniptale-step-badge-settings-handle'
  );
  const controls = document.querySelector<HTMLElement>('.sniptale-step-badge-controls');
  const controlsPositioner = controls?.parentElement;

  expect(moveHandle).toBeInstanceOf(HTMLButtonElement);
  expect(settingsHandle).toBeInstanceOf(HTMLButtonElement);
  expect(controlsPositioner?.style.opacity).toBe('0');

  act(() => moveHandle?.focus());
  expect(controlsPositioner?.style.opacity).toBe('1');

  act(() => settingsHandle?.click());
  expect(onSettingsClick).toHaveBeenCalledOnce();

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('hides only the quick settings button while a main toolbar owns the frame UI', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
        isSettingsOpen
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle={false}
      />
    );
  });

  expect(document.querySelector('.sniptale-step-badge-move-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  expect(document.querySelector('.sniptale-step-badge-settings-handle')).toBeNull();

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('reanchors move and settings controls after scroll updates the frame geometry', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let badgeRect = new DOMRect(100, 80, 30, 30);
  const rectSpy = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      return this.classList.contains('sniptale-step-badge') ? badgeRect : new DOMRect();
    });
  const settings = createStepBadgeSettingsFixture({ value: '7' });
  const renderBadge = (frameY: number) => {
    root.render(
      <StepBadge
        settings={settings}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: frameY }}
        isSettingsOpen
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        settingsAnchorRef={{ current: null }}
        showSettingsHandle
      />
    );
  };

  act(() => renderBadge(80));
  const controls = document.querySelector<HTMLElement>('.sniptale-step-badge-controls');
  const controlsPositioner = controls?.parentElement;
  expect(controlsPositioner?.style.left).toBe('136px');
  expect(controlsPositioner?.style.top).toBe('50px');

  act(() => window.dispatchEvent(new Event('scroll')));
  badgeRect = new DOMRect(100, 30, 30, 30);
  act(() => renderBadge(30));

  expect(controlsPositioner?.style.top).toBe('64px');
  expect(controls?.querySelector('.sniptale-step-badge-move-handle')).toBeInstanceOf(
    HTMLButtonElement
  );
  expect(controls?.querySelector('.sniptale-step-badge-settings-handle')).toBeInstanceOf(
    HTMLButtonElement
  );

  rectSpy.mockRestore();
  act(() => root.unmount());
  document.body.replaceChildren();
});

it('mounts a positioned badge in the shared overlay above every frame root', () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  const { appContainer, overlayRoot } = initializeContentUiRoots(shadowRoot);
  const frameRoot = document.createElement('div');
  appContainer.append(frameRoot);
  const root = createRoot(frameRoot);

  act(() => {
    root.render(
      <StepBadge
        settings={createStepBadgeSettingsFixture({ value: '7' })}
        borderColor="#000"
        borderWidth={2}
        frameRect={{ height: 120, width: 200, x: 100, y: 80 }}
      />
    );
  });

  const badgeLayer = overlayRoot.querySelector<HTMLElement>('.sniptale-step-badge-layer');
  const badge = badgeLayer?.querySelector<HTMLElement>('.sniptale-step-badge');
  expect(resolveContentOverlayRoot()).toBe(overlayRoot);
  expect(badgeLayer?.parentElement).toBe(overlayRoot);
  expect(frameRoot.querySelector('.sniptale-step-badge')).toBeNull();
  expect(badgeLayer?.style.position).toBe('fixed');
  expect(badgeLayer?.style.left).toBe('100px');
  expect(badgeLayer?.style.top).toBe('80px');
  expect(badgeLayer?.style.width).toBe('200px');
  expect(badgeLayer?.style.height).toBe('120px');
  expect(badgeLayer?.style.zIndex).toBe('2147483645');
  expect(badge?.style.position).toBe('absolute');

  act(() => root.unmount());
  document.body.replaceChildren();
});

it('omits interaction chrome for export and short-circuits a disabled shared badge', () => {
  const surfaceHost = document.createElement('div');
  const controlsHost = document.createElement('div');
  const host = document.createElement('div');
  document.body.append(host, surfaceHost, controlsHost);
  const root = createRoot(host);
  const coordinateSpace = {
    viewport: { height: 400, width: 600 },
    clientPointToLogical: (point: { x: number; y: number }) => point,
    clientRectToLogical: (rect: { x: number; y: number; width: number; height: number }) => rect,
    logicalPointToClient: (point: { x: number; y: number }) => point,
    logicalRectToClient: (rect: { x: number; y: number; width: number; height: number }) => rect,
  };

  act(() => {
    root.render(
      <FrameStepBadgeInteractiveSurface
        borderColor="#123456"
        borderWidth={3}
        chrome="export"
        controlsPortalTarget={controlsHost}
        coordinateSpace={coordinateSpace}
        fillColor="#abcdef80"
        frameRect={{ height: 40, width: 60, x: 10, y: 20 }}
        onClick={vi.fn()}
        onPositionChange={vi.fn()}
        onSettingsClick={vi.fn()}
        portalTheme="dark"
        settings={createStepBadgeSettingsFixture({ value: '9' })}
        settingsAnchorRef={{ current: null }}
        shadow={2}
        showSettingsHandle
        surfacePortalTarget={surfaceHost}
      />
    );
  });

  expect(surfaceHost.querySelector('.sniptale-step-badge')).toBeInstanceOf(HTMLDivElement);
  expect(controlsHost.querySelector('.sniptale-step-badge-controls')).toBeNull();

  act(() => {
    root.render(
      <FrameStepBadgeInteractiveSurface
        borderColor="#123456"
        borderWidth={3}
        controlsPortalTarget={controlsHost}
        frameRect={{ height: 40, width: 60, x: 10, y: 20 }}
        portalTheme={null}
        settings={createStepBadgeSettingsFixture({ enabled: false })}
        showSettingsHandle={false}
        surfacePortalTarget={surfaceHost}
      />
    );
  });

  expect(surfaceHost.querySelector('.sniptale-step-badge')).toBeNull();
  act(() => root.unmount());
  document.body.replaceChildren();
});
