// @vitest-environment jsdom
import { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewSpatialToolContext, ReviewSpatialToolbar } from './spatial-controls';
import { ReviewZoomInspector } from './zoom-inspector';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;
const region = createQuickEditZoomRegion({ id: 'reset-destination', at: 2 });
const field = (label: string) => host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('keeps one guarded spatial reset after exact fields and removes it on unmount', () => {
  const reset = vi.fn();
  function PreviewTools({ disabled }: { disabled: boolean }) {
    const selection = useContext(ReviewSpatialToolContext)!;
    return (
      <ReviewSpatialToolbar
        tool={selection.tool}
        axis="both"
        disabled={disabled}
        onTool={selection.onTool}
        onAxis={vi.fn()}
        onReset={reset}
        resetTarget={selection.resetTarget}
      />
    );
  }
  const render = (disabled: boolean) =>
    act(() =>
      root.render(
        <ReviewZoomInspector
          region={region}
          onChange={vi.fn()}
          onReset={vi.fn()}
          onDelete={vi.fn()}
          preview={<PreviewTools disabled={disabled} />}
        />
      )
    );
  render(false);
  const resetButton = () =>
    host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.spatialResetPosition"]'
    )!;
  expect(
    host.querySelectorAll('[aria-label="gallery.videoReview.spatialResetPosition"]')
  ).toHaveLength(1);
  expect(
    field('gallery.videoReview.zoomFocusY').compareDocumentPosition(resetButton()) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  act(() => resetButton().click());
  expect(reset).toHaveBeenCalledTimes(1);
  render(true);
  expect(resetButton().disabled).toBe(true);
  act(() => resetButton().click());
  expect(reset).toHaveBeenCalledTimes(1);
  const detached = resetButton();
  act(() => root.render(<div />));
  expect(detached.isConnected).toBe(false);
});
