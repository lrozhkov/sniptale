// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultFrameCallout } from '../defaults';
import { FrameCalloutInteractiveSurface } from './interactive-surface';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('enables editing and moves the caret into a heading created from the H control', () => {
  const noop = vi.fn();
  function Harness() {
    const [settings, setSettings] = React.useState(() => createDefaultFrameCallout());
    const [isEditing, setIsEditing] = React.useState(false);
    return (
      <FrameCalloutInteractiveSurface
        chromeScale={1}
        editing={{
          events: {
            applyFormatting: noop,
            blur: noop,
            click: () => setIsEditing(true),
            finish: noop,
            input: noop,
            keyDown: noop,
            paste: noop,
          },
          layout: { dimensions: { width: 180, height: 70 }, floatingToolbarRect: null },
          refs: { container: React.createRef(), contentEditable: React.createRef() },
        }}
        frameBorderWidth={2}
        frameId="frame-focus"
        frameRect={{ x: 100, y: 100, width: 220, height: 140 }}
        isEditing={isEditing}
        isFrameEditing={false}
        isSettingsOpen={false}
        onBadgeTextChange={noop}
        onCurveChange={noop}
        onPositionChange={noop}
        onSettingsClick={noop}
        onStartEditing={() => setIsEditing(true)}
        onTailBaseRangeChange={noop}
        onTailFramePositionChange={noop}
        onTitleChange={noop}
        onTitleEnabledChange={(enabled) =>
          setSettings((current) => ({
            ...current,
            style: { ...current.style, title: { ...current.style.title, enabled } },
          }))
        }
        onWaypointChange={noop}
        onWidthChange={noop}
        portalTarget={document.body}
        portalTheme={null}
        settings={settings}
        settingsAnchorRef={React.createRef()}
        showSettingsHandle
        zIndex={2}
      />
    );
  }

  act(() => root.render(<Harness />));
  act(() =>
    document.querySelector<HTMLButtonElement>('.sniptale-callout-title-toggle-handle')?.click()
  );

  const input = document.querySelector<HTMLInputElement>('[data-sniptale-callout-title="true"]');
  expect(input).not.toBeNull();
  expect(document.activeElement).toBe(input);
  expect(input?.readOnly).toBe(false);
});

it('starts editing while keeping the caret in a directly clicked badge', () => {
  const noop = vi.fn();
  function Harness() {
    const [isEditing, setIsEditing] = React.useState(false);
    const [settings, setSettings] = React.useState(() => {
      const callout = createDefaultFrameCallout();
      return {
        ...callout,
        style: {
          ...callout.style,
          badge: { ...callout.style.badge, enabled: true, text: 'Tag' },
        },
      };
    });
    return (
      <FrameCalloutInteractiveSurface
        chromeScale={1}
        editing={{
          events: {
            applyFormatting: noop,
            blur: noop,
            click: () => setIsEditing(true),
            finish: noop,
            input: noop,
            keyDown: noop,
            paste: noop,
          },
          layout: { dimensions: { width: 180, height: 70 }, floatingToolbarRect: null },
          refs: { container: React.createRef(), contentEditable: React.createRef() },
        }}
        frameBorderWidth={2}
        frameId="frame-badge-focus"
        frameRect={{ x: 100, y: 100, width: 220, height: 140 }}
        isEditing={isEditing}
        isFrameEditing={false}
        isSettingsOpen={false}
        onBadgeTextChange={(text) =>
          setSettings((current) => ({
            ...current,
            style: { ...current.style, badge: { ...current.style.badge, text } },
          }))
        }
        onCurveChange={noop}
        onPositionChange={noop}
        onSettingsClick={noop}
        onStartEditing={() => setIsEditing(true)}
        onTailBaseRangeChange={noop}
        onTailFramePositionChange={noop}
        onTitleChange={noop}
        onTitleEnabledChange={noop}
        onWaypointChange={noop}
        onWidthChange={noop}
        portalTarget={document.body}
        portalTheme={null}
        settings={settings}
        settingsAnchorRef={React.createRef()}
        showSettingsHandle
        zIndex={2}
      />
    );
  }

  act(() => root.render(<Harness />));
  const badge = document.querySelector<HTMLInputElement>('input[data-ui="content.callout.badge"]');
  act(() => badge?.click());

  expect(document.activeElement).toBe(badge);
  expect(badge?.readOnly).toBe(false);
});
