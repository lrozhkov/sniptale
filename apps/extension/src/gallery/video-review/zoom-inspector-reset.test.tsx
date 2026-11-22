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

it('uses the selection menu reset without duplicating a spatial reset in the body', () => {
  const reset = vi.fn();
  const selectionReset = vi.fn();
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
          onReset={selectionReset}
          onDelete={vi.fn()}
          preview={<PreviewTools disabled={disabled} />}
        />
      )
    );
  render(false);
  expect(host.querySelector('.review-spatial-reset')).toBeNull();
  expect(host.querySelectorAll('[data-selection-action="reset"]')).toHaveLength(1);
  act(() => host.querySelector<HTMLButtonElement>('[data-selection-action="reset"]')!.click());
  expect(selectionReset).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
  render(true);
  expect(host.querySelector('.review-spatial-reset')).toBeNull();
});
