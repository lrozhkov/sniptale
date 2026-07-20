// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const { dialogSpy } = vi.hoisted(() => ({
  dialogSpy: vi.fn(),
}));

vi.mock('./image-step/ScenarioImageStepDialog', () => ({
  ScenarioImageStepDialog: (props: object) => {
    dialogSpy(props);
    return <div data-testid="image-dialog">dialog</div>;
  },
}));

import { ScenarioImageInsertOverlay } from './ScenarioImageInsertOverlay';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderOverlay(imageInsertIndex: number | null) {
  const onClose = vi.fn();
  const onInsertImage = vi.fn(async () => undefined);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ScenarioImageInsertOverlay
        imageInsertIndex={imageInsertIndex}
        onClose={onClose}
        onInsertImage={onInsertImage}
      />
    );
  });

  return { onClose, onInsertImage };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  dialogSpy.mockReset();
});

it('renders nothing while no image insert position is selected', () => {
  renderOverlay(null);

  expect(container?.textContent).toBe('');
  expect(dialogSpy).not.toHaveBeenCalled();
});

it('forwards dialog payloads and closes after a successful insert', async () => {
  const { onClose, onInsertImage } = renderOverlay(3);
  const onDialogInsertImage = dialogSpy.mock.calls[0]?.[0]?.onInsertImage as (
    payload: object
  ) => Promise<void>;

  await onDialogInsertImage({ blob: new Blob(['image']), filename: 'local.png' });

  expect(onInsertImage).toHaveBeenCalledWith(3, expect.objectContaining({ filename: 'local.png' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
