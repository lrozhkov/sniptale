// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioWorkspaceStageShell } from './surface';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./preview', () => ({
  ScenarioWorkspacePreview: () => <div data-testid="scenario-workspace-preview" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createCallbacks() {
  return {
    onDecreaseZoom: vi.fn(),
    onIncreaseZoom: vi.fn(),
    onOpenEditor: vi.fn(),
    onResetView: vi.fn(),
    setDragState: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ScenarioWorkspaceStageShell refs', () => {
  it('assigns the outer container and stage refs through the stage shell', () => {
    const callbacks = createCallbacks();
    const containerRef = createRef<HTMLDivElement>();
    const stageRef = createRef<HTMLDivElement>();

    act(() => {
      root?.render(
        <ScenarioWorkspaceStageShell
          clickPreviewActive={false}
          clickPreviewVisible={false}
          containerRef={containerRef}
          dragging={false}
          framePreviewActive={false}
          framePreviewVisible={false}
          onDecreaseZoom={callbacks.onDecreaseZoom}
          onIncreaseZoom={callbacks.onIncreaseZoom}
          onOpenEditor={callbacks.onOpenEditor}
          onResetView={callbacks.onResetView}
          onToggleClickPreview={vi.fn()}
          onToggleFramePreview={vi.fn()}
          scale={1}
          setDragState={callbacks.setDragState}
          stageRef={stageRef}
          step={createScenarioCaptureStep({
            assetId: 'asset-1',
            title: 'Capture title',
          })}
        />
      );
    });

    expect(containerRef.current).toBeInstanceOf(HTMLDivElement);
    expect(stageRef.current).toBeInstanceOf(HTMLDivElement);
  });
});
