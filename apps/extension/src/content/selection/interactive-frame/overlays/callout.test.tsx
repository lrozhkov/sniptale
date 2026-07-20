// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/react/test-support';
import { InteractiveFrameCalloutOverlay } from './callout';

vi.mock('../../callout', () => ({
  Callout: (props: { onContentChange: (html: string) => void }) => (
    <button
      data-ui="callout-change"
      onClick={() => props.onContentChange('<p>updated</p>')}
      type="button"
    >
      update
    </button>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function createFrame(): FrameData {
  return createFrameDataFixture('frame-1', {
    borderSettings: createBorderSettingsFixture({
      color: '#ff671d',
      id: 'preset-1',
      name: 'Preset',
      opacity: 100,
      radius: 0,
      width: 3,
    }),
    callout: createCalloutSettingsFixture({ htmlContent: '<p>initial</p>' }),
    width: 100,
  });
}

describe('interactive frame callout overlay', () => {
  it('commits the merged frame snapshot immediately when callout content changes', () => {
    const frame = createFrame();
    const onUpdate = vi.fn();
    const setTempFrame = vi.fn();

    renderNode(
      <InteractiveFrameCalloutOverlay
        frame={frame}
        currentFrame={frame}
        frameZIndex={100}
        isCalloutEditing
        setIsCalloutEditing={vi.fn()}
        setTempFrame={setTempFrame}
        onUpdate={onUpdate}
      />
    );

    const button = container?.querySelector<HTMLButtonElement>('[data-ui="callout-change"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      button?.click();
    });

    const expectedFrame = {
      ...frame,
      callout: {
        ...frame.callout!,
        htmlContent: '<p>updated</p>',
      },
    };

    expect(setTempFrame).toHaveBeenCalledWith(expectedFrame);
    expect(onUpdate).toHaveBeenCalledWith(expectedFrame);
  });
});
