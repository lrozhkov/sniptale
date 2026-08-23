// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const popovers = vi.hoisted(() => ({ callout: null as Record<string, unknown> | null }));

vi.mock('../../composition/frame-annotation-controls/callout/popover', () => ({
  FutureCalloutSettingsPopover: (props: Record<string, unknown>) => {
    popovers.callout = props;
    return null;
  },
}));
vi.mock('../../composition/frame-annotation-controls/step-badge/popover', () => ({
  FutureStepBadgeSettingsPopover: () => null,
}));
vi.mock('../../composition/frame-annotation-controls/frame/popover', () => ({
  FrameAnnotationStyleSettings: () => null,
  FrameAnnotationCreationFramePopover: () => null,
}));

import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import { createDefaultFrameCallout } from '../../features/highlighter/frame-annotation/defaults';
import { FrameProjectionSettings } from './projection-settings';

afterEach(() => {
  popovers.callout = null;
  document.body.replaceChildren();
});

it('targets and removes the selected additional editor callout', () => {
  const primary = { ...createDefaultFrameCallout(), content: { bodyHtml: 'one', titleText: '' } };
  const extra = {
    ...createDefaultFrameCallout(),
    instanceId: 'extra-callout',
    content: { bodyHtml: 'two', titleText: '' },
  };
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'frame-1',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      callout: primary,
      additionalCallouts: [extra],
    },
    0
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();

  act(() =>
    root.render(
      <FrameProjectionSettings
        activeCalloutIndex={1}
        anchor={null}
        close={vi.fn()}
        controlsRoot={host}
        menu="callout"
        onChange={onChange}
        onDraftCommit={vi.fn()}
        onPreview={vi.fn()}
        onReorder={vi.fn()}
        scene={{ borderColor: '#f97316', borderWidth: 2 }}
        snapshot={snapshot}
      />
    )
  );
  act(() => (popovers.callout!['onDisable'] as () => void)());

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      additionalCallouts: [],
      callout: expect.objectContaining({ content: primary.content }),
    })
  );
  act(() => root.unmount());
});
