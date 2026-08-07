// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  cloneBorderPresetEffects,
  projectBorderPresetToAppliedSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { useFrameCaptureVisibilityState } from './capture-visibility-state';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('preserves freshly linked templates when a subsequent capture-visibility action runs', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onUpdate = vi.fn();
  const baseBorder = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
  const baseFrame: FrameData = {
    id: 'frame-1',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    borderSettings: baseBorder,
  };
  const linkedFrame: FrameData = {
    ...baseFrame,
    borderSettings: {
      ...baseBorder,
      effects: {
        ...cloneBorderPresetEffects(baseBorder.effects),
        linkedTemplates: {
          calloutPresetId: 'callout-template',
          stepBadgePresetId: 'badge-template',
        },
      },
    },
  };

  function Harness(props: { frame: FrameData }) {
    const state = useFrameCaptureVisibilityState({ frame: props.frame, onUpdate });
    return <button onClick={state.toggle}>toggle</button>;
  }

  act(() => root.render(<Harness frame={baseFrame} />));
  act(() => root.render(<Harness frame={linkedFrame} />));
  act(() => host.querySelector<HTMLButtonElement>('button')?.click());

  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      borderSettings: expect.objectContaining({
        effects: expect.objectContaining({
          linkedTemplates: linkedFrame.borderSettings?.effects?.linkedTemplates,
        }),
      }),
    })
  );
  act(() => root.unmount());
});
