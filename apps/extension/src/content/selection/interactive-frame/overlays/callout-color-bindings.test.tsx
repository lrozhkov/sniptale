// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/react/test-support';
import { InteractiveFrameCalloutOverlay } from './callout';

let renderedSettings: CalloutSettings | null = null;

vi.mock('../../callout', () => ({
  Callout: (props: { settings: CalloutSettings }) => {
    renderedSettings = props.settings;
    return null;
  },
}));

vi.mock('../../frame-runtime/state/frame-ui.store', () => ({
  useFrameUIStore: (
    selector: (state: { selectedFrameId: null; toggleQuickPopover: () => void }) => unknown
  ) => selector({ selectedFrameId: null, toggleQuickPopover: vi.fn() }),
}));

afterEach(() => {
  renderedSettings = null;
  document.body.replaceChildren();
});

it('resolves inherited comment colors from the connected frame before rendering', () => {
  const frame = createFrameDataFixture('frame-colors', {
    borderSettings: createBorderSettingsFixture({
      color: '#112233',
      fillColor: '#445566',
      fillOpacity: 50,
    }),
    callout: createCalloutSettingsFixture(),
  });
  frame.callout!.style.colorBindings = {
    accent: 'frame-border',
    connector: 'frame-border',
    surfaceBackground: 'frame-fill',
    surfaceBorder: 'frame-border',
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InteractiveFrameCalloutOverlay
        calloutPopoverAnchorRef={{ current: null }}
        currentFrame={frame}
        frame={frame}
        frameZIndex={100}
        isCalloutEditing={false}
        isCalloutPopoverOpen={false}
        isFrameEditing={false}
        onUpdate={vi.fn()}
        setIsCalloutEditing={vi.fn()}
        setTempFrame={vi.fn()}
      />
    );
  });

  expect(renderedSettings?.style.connector.color).toBe('#112233');
  expect(renderedSettings?.style.accentEdge.color).toBe('#112233');
  expect(renderedSettings?.style.surface.borderColor).toBe('#112233');
  expect(renderedSettings?.style.surface.backgroundColor).toBe('#445566');
  act(() => root.unmount());
});
