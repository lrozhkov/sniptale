// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../composition/frame-annotation-controls/step-badge/popover', () => ({
  FutureStepBadgeSettingsPopover: (props: { isOpen: boolean }) =>
    props.isOpen ? <div data-ui="step-settings-open" /> : null,
}));
vi.mock('../../composition/frame-annotation-controls/callout/popover', async () => {
  const { usePopoverEscapeClose } =
    await import('../../composition/frame-annotation-controls/popover/hooks');
  return {
    FutureCalloutSettingsPopover: (props: {
      anchorEl: HTMLButtonElement | null;
      isOpen: boolean;
      onClose: () => void;
      onDisable: () => void;
      settings: { instanceId?: string };
    }) => {
      usePopoverEscapeClose(props);
      return props.isOpen ? (
        <div
          data-ui="callout-settings-open"
          data-instance-id={props.settings.instanceId ?? 'primary'}
        >
          <button data-ui="delete-callout" onClick={props.onDisable} />
        </div>
      ) : null;
    },
  };
});
vi.mock('../../composition/frame-annotation-controls/frame/popover', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/frame-annotation-controls/frame/popover')
  >()),
  FrameAnnotationCreationFramePopover: () => null,
}));
vi.mock('../../features/highlighter/frame-annotation/step-badge/interactive-surface', () => ({
  FrameStepBadgeInteractiveSurface: (props: {
    onSettingsClick?: () => void;
    settingsAnchorRef?: React.RefObject<HTMLButtonElement | null>;
    showSettingsHandle: boolean;
  }) =>
    props.showSettingsHandle ? (
      <button
        ref={props.settingsAnchorRef}
        data-ui="inline-step-settings"
        onClick={props.onSettingsClick}
      />
    ) : null,
}));
vi.mock('./callout-projection', () => ({
  EditorFrameCallout: () => null,
  resolveCalloutCenter: () => null,
}));

import { identityFrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { getFrameAnnotationCommandSchema } from '../../features/highlighter/frame-annotation/commands';
import { applyFrameAnnotationCommand } from './commands';
import { createFrameAnnotationProxy } from './proxy';
import { FrameProjection } from './projection';

afterEach(() => document.body.replaceChildren());

it('enables numbering and opens its shared settings menu in one interaction', () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  document.body.append(host, controlsRoot);
  const root = createRoot(host);
  const initial = createFrameAnnotationSnapshot(
    { id: 'frame-1', x: 100, y: 100, width: 240, height: 160 },
    0
  );
  const object = createFrameAnnotationProxy({
    frame: initial,
    label: 'Frame annotation 1',
    ordering: 0,
  });

  function Harness() {
    const [snapshot, setSnapshot] = React.useState(initial);
    const [settings, setSettings] = React.useState<{
      anchor: HTMLButtonElement;
      menu: 'callout' | 'effect' | 'step';
    } | null>(null);
    return (
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive
        object={object}
        sceneRoot={null}
        selected
        scale={1}
        snapshot={snapshot}
        settingsAnchor={settings?.anchor ?? null}
        settingsMenu={settings?.menu ?? null}
        onCommand={(command) =>
          setSnapshot((current) => applyFrameAnnotationCommand(current, command))
        }
        onDraftCommit={vi.fn()}
        onCloseSettings={() => setSettings(null)}
        onOpenSettings={(menu, anchor) => setSettings({ anchor, menu })}
        onMoveStart={vi.fn()}
        onResizeStart={vi.fn()}
        onSnapshotChange={setSnapshot}
        onSnapshotPreview={setSnapshot}
        onStepBadgeReorder={vi.fn()}
      />
    );
  }

  act(() => root.render(<Harness />));
  const stepLabel = getFrameAnnotationCommandSchema().find(
    (command) => command.id === 'step-badge'
  )?.label;
  const stepButton = Array.from(controlsRoot.querySelectorAll('button')).find(
    (button) => button.title === stepLabel
  );
  expect(stepButton).toBeDefined();
  act(() => stepButton?.click());

  expect(document.querySelector('[data-ui="step-settings-open"]')).not.toBeNull();
  expect(document.querySelector('[data-frame-control="resize-handle"]')).toBeNull();
  expect(controlsRoot.querySelector(`button[title="${stepLabel}"]`)).toBe(stepButton);
  expect(stepButton?.isConnected).toBe(true);
  act(() => root.unmount());
});

it('opens the same numbering settings session from the inline badge handle', () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, controlsRoot, sceneRoot);
  const root = createRoot(host);
  const initial = createFrameAnnotationSnapshot(
    {
      id: 'frame-2',
      x: 100,
      y: 100,
      width: 240,
      height: 160,
      stepBadge: { ...createDefaultFrameStepBadge(), enabled: true },
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: initial, label: 'Frame 2', ordering: 0 });

  function Harness() {
    const [settings, setSettings] = React.useState<{
      anchor: HTMLButtonElement;
      menu: 'callout' | 'effect' | 'step';
    } | null>(null);
    return (
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive
        object={object}
        sceneRoot={sceneRoot}
        selected={false}
        scale={1}
        snapshot={initial}
        settingsAnchor={settings?.anchor ?? null}
        settingsMenu={settings?.menu ?? null}
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={() => setSettings(null)}
        onMoveStart={vi.fn()}
        onOpenSettings={(menu, anchor) => setSettings({ anchor, menu })}
        onResizeStart={vi.fn()}
        onSnapshotChange={vi.fn()}
        onSnapshotPreview={vi.fn()}
        onStepBadgeReorder={vi.fn()}
      />
    );
  }

  act(() => root.render(<Harness />));
  act(() => document.querySelector<HTMLButtonElement>('[data-ui="inline-step-settings"]')?.click());
  expect(document.querySelector('[data-ui="step-settings-open"]')).not.toBeNull();
  act(() => root.unmount());
});

it('adds comments through the fifth, deletes one, and routes primary settings to index zero', () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  document.body.append(host, controlsRoot);
  const root = createRoot(host);
  const initial = createFrameAnnotationSnapshot(
    {
      id: 'frame-comments',
      x: 100,
      y: 100,
      width: 240,
      height: 160,
      callout: { ...createDefaultFrameCallout(), enabled: true },
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: initial, label: 'Frame', ordering: 0 });
  let latest = initial;

  function Harness() {
    const [snapshot, setSnapshot] = React.useState(initial);
    const [settings, setSettings] = React.useState<{
      anchor: HTMLButtonElement;
      menu: 'callout' | 'effect' | 'step';
    } | null>(null);
    const change = (next: typeof initial) => {
      latest = next;
      setSnapshot(next);
    };
    return (
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive
        object={object}
        sceneRoot={null}
        selected
        scale={1}
        snapshot={snapshot}
        settingsAnchor={settings?.anchor ?? null}
        settingsMenu={settings?.menu ?? null}
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={() => setSettings(null)}
        onOpenSettings={(menu, anchor) => setSettings({ anchor, menu })}
        onMoveStart={vi.fn()}
        onResizeStart={vi.fn()}
        onSnapshotChange={change}
        onSnapshotPreview={change}
        onStepBadgeReorder={vi.fn()}
      />
    );
  }

  act(() => root.render(<Harness />));
  const add = controlsRoot.querySelector<HTMLButtonElement>(
    '[data-ui="content.interactive-frame.add-callout"]'
  )!;
  for (let count = 2; count <= 5; count += 1) {
    act(() => add.click());
    expect(latest.additionalCallouts).toHaveLength(count - 1);
    expect(
      document.querySelector('[data-ui="callout-settings-open"]')?.getAttribute('data-instance-id')
    ).toBe(latest.additionalCallouts?.at(-1)?.instanceId);
  }
  expect(add.disabled).toBe(true);
  act(() => document.querySelector<HTMLButtonElement>('[data-ui="delete-callout"]')?.click());
  expect(latest.additionalCallouts).toHaveLength(3);
  expect(add.disabled).toBe(false);
  act(() => add.click());
  expect(latest.additionalCallouts).toHaveLength(4);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.activeElement).toBeInstanceOf(HTMLButtonElement);
  expect((document.activeElement as HTMLButtonElement).disabled).toBe(false);

  const primary = Array.from(controlsRoot.querySelectorAll('button')).find(
    (button) =>
      button.title ===
      getFrameAnnotationCommandSchema().find((item) => item.id === 'callout')?.label
  );
  act(() => primary?.click());
  expect(
    document.querySelector('[data-ui="callout-settings-open"]')?.getAttribute('data-instance-id')
  ).toBe(initial.callout?.instanceId);
  act(() => root.unmount());
});
