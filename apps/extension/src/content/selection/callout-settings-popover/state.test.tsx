// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCalloutPopoverSettingsChangedListener } from '../../platform/page-context/frame-events';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { useCalloutSettingsPopoverState } from './state';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { createDefaultCalloutSettings } from '../callout/model';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useCalloutSettingsPopoverState> | null = null;
let isOpen = true;
let settings: CalloutSettings | undefined;

function Harness() {
  latestState = useCalloutSettingsPopoverState({
    frameId: 'frame-1',
    isOpen,
    ...(settings ? { settings } : {}),
  });
  return null;
}

function renderHarness(nextIsOpen = true) {
  isOpen = nextIsOpen;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  isOpen = true;
  settings = undefined;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe('useCalloutSettingsPopoverState', () => {
  it('dispatches callout popover setting changes through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addCalloutPopoverSettingsChangedListener(listener);

    renderHarness();
    act(() => {
      latestState?.handleSettingChange({ style: { surface: { backgroundColor: 'transparent' } } });
    });

    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: {
        sourcePresetId: undefined,
        style: { surface: { backgroundColor: 'transparent' } },
      },
    });

    cleanup();
  });

  it('applies the preset default position and clears session-only placement overrides', () => {
    settings = createDefaultCalloutSettings();
    settings.placement = {
      ...settings.placement,
      connectorBasePosition: 0.4,
      connectorFramePosition: 0.7,
      manualPlacement: { centerOffsetX: 20, centerOffsetY: 30 },
    };
    const preset = {
      ...createSystemCalloutPresetCatalog()[0]!,
      placement: { anchor: 'bottom-right', side: 'bottom' } as const,
    };
    renderHarness();

    act(() => latestState?.applyPreset(preset));

    expect(latestState?.localSettings.placement).toEqual({
      anchor: 'bottom-right',
      connectorBasePosition: undefined,
      connectorBaseWidth: undefined,
      connectorFramePosition: undefined,
      manualPlacement: undefined,
      side: 'bottom',
    });
    expect(latestState?.localSettings.sourcePresetId).toBe(preset.id);
  });

  it('opens and commits one history transaction for the popover session', () => {
    const beginTransactionSpy = vi.spyOn(pagePreparationHistory, 'beginTransaction');
    const commitTransactionSpy = vi.spyOn(pagePreparationHistory, 'commitTransaction');

    renderHarness(true);
    expect(beginTransactionSpy).toHaveBeenCalledWith('callout-settings:frame-1');

    renderHarness(false);
    expect(commitTransactionSpy).toHaveBeenCalledWith('callout-settings:frame-1');
  });

  it('clears manual placement when an anchor or side is selected', () => {
    settings = createDefaultCalloutSettings();
    settings.placement = {
      ...settings.placement,
      manualPlacement: { centerOffsetX: 60, centerOffsetY: -30 },
      connectorBasePosition: 0.75,
      connectorBaseWidth: 0.2,
      connectorFramePosition: 0.25,
    };
    const listener = vi.fn();
    const cleanup = addCalloutPopoverSettingsChangedListener(listener);
    renderHarness();

    act(() => latestState?.handleSettingChange({ placement: { side: 'right' } }));

    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: {
        placement: {
          side: 'right',
          manualPlacement: undefined,
          connectorBasePosition: undefined,
          connectorBaseWidth: undefined,
          connectorFramePosition: undefined,
        },
      },
    });
    expect(latestState?.localSettings.placement.manualPlacement).toBeUndefined();
    expect(latestState?.localSettings.placement.connectorBasePosition).toBeUndefined();
    expect(latestState?.localSettings.placement.connectorBaseWidth).toBeUndefined();
    expect(latestState?.localSettings.placement.connectorFramePosition).toBeUndefined();
    cleanup();
  });

  it('clears perimeter endpoint overrides when connector kind changes', () => {
    settings = createDefaultCalloutSettings();
    settings.style.connector.kind = 'line';
    settings.placement = {
      ...settings.placement,
      connectorBasePosition: 0.8,
      connectorBaseWidth: 0,
      connectorFramePosition: 0.6,
    };
    const listener = vi.fn();
    const cleanup = addCalloutPopoverSettingsChangedListener(listener);
    renderHarness();

    act(() => latestState?.handleSettingChange({ style: { connector: { kind: 'wedge' } } }));

    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: {
        placement: {
          connectorBasePosition: undefined,
          connectorBaseWidth: undefined,
          connectorFramePosition: undefined,
        },
        sourcePresetId: undefined,
        style: { connector: { kind: 'wedge' } },
      },
    });
    cleanup();
  });

  it('clears only the route control point when connector routing changes', () => {
    settings = createDefaultCalloutSettings();
    settings.style.connector.kind = 'line';
    settings.style.connector.routing = 'elbow';
    settings.placement = {
      ...settings.placement,
      connectorBasePosition: 0.8,
      connectorFramePosition: 0.6,
      connectorWaypoint: { centerOffsetX: 20, centerOffsetY: -30 },
    };
    const listener = vi.fn();
    const cleanup = addCalloutPopoverSettingsChangedListener(listener);
    renderHarness();

    act(() => latestState?.handleSettingChange({ style: { connector: { routing: 'polyline' } } }));

    expect(latestState?.localSettings.placement).toMatchObject({
      connectorBasePosition: 0.8,
      connectorFramePosition: 0.6,
    });
    expect(latestState?.localSettings.placement.connectorWaypoint).toBeUndefined();
    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: {
        placement: { connectorWaypoint: undefined },
        sourcePresetId: undefined,
        style: { connector: { routing: 'polyline' } },
      },
    });
    cleanup();
  });

  it('cancels an open history transaction when the popover unmounts mid-session', () => {
    const cancelTransactionSpy = vi.spyOn(pagePreparationHistory, 'cancelTransaction');

    renderHarness(true);

    act(() => {
      root?.unmount();
    });

    root = null;

    expect(cancelTransactionSpy).toHaveBeenCalledWith('callout-settings:frame-1');
  });
});
