// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { useScenarioCaptureStepDraft } from './useScenarioCaptureStepDraft';

function CaptureStepDraftHarness(props: { step: ReturnType<typeof createScenarioCaptureStep> }) {
  const { draftStep, setDraftPatch } = useScenarioCaptureStepDraft(props.step);

  return (
    <div>
      <button
        type="button"
        data-testid="preview"
        onClick={() =>
          setDraftPatch({
            imageTransform: {
              ...draftStep.imageTransform,
              x: draftStep.imageTransform.x + 12,
            },
          })
        }
      >
        preview
      </button>
      <span data-testid="draft-x">{draftStep.imageTransform.x}</span>
      <span data-testid="draft-title">{draftStep.title}</span>
    </div>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep(overrides: Partial<ReturnType<typeof createScenarioCaptureStep>> = {}) {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture step',
    ...overrides,
  });
}

function renderHarness(step = createStep()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<CaptureStepDraftHarness step={step} />);
  });

  return { step };
}

function clickPreview() {
  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="preview"]')?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('applies a preview patch without mutating the source step', () => {
  const { step } = renderHarness();

  clickPreview();

  expect(container?.querySelector('[data-testid="draft-x"]')?.textContent).toBe('12');
  expect(step.imageTransform.x).toBe(0);
});

it('clears the preview patch when the source capture step changes', () => {
  renderHarness(createStep({ title: 'Initial capture' }));
  clickPreview();

  act(() => {
    root?.render(<CaptureStepDraftHarness step={createStep({ title: 'Updated capture' })} />);
  });

  expect(container?.querySelector('[data-testid="draft-x"]')?.textContent).toBe('0');
  expect(container?.querySelector('[data-testid="draft-title"]')?.textContent).toBe(
    'Updated capture'
  );
});
