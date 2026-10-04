// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  GuideLayoutAssistance,
  useGuideImageBounds,
  useGuideLayoutAssistance,
} from './layout-assistance';

it('keeps document boundaries independent of per-image crop bounds and resets both on remount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Probe({ assetId }: { assetId: string }) {
    const { showBoundaries, setShowBoundaries, snap, setSnap } = useGuideLayoutAssistance();
    const { cropBounds, setCropBounds } = useGuideImageBounds({ id: 'block', assetId });
    return (
      <>
        <button aria-pressed={showBoundaries} onClick={() => setShowBoundaries(!showBoundaries)}>
          Boundaries
        </button>
        <button aria-pressed={cropBounds} onClick={() => setCropBounds(!cropBounds)}>
          Crop bounds
        </button>
        <button aria-pressed={snap} onClick={() => setSnap(!snap)}>
          Snap
        </button>
      </>
    );
  }
  const draw = (assetId: string) =>
    act(async () =>
      root.render(
        <GuideLayoutAssistance>
          <Probe assetId={assetId} />
        </GuideLayoutAssistance>
      )
    );
  const state = () =>
    [...host.querySelectorAll('button')].map((button) => button.getAttribute('aria-pressed'));
  const click = (index: number) => act(async () => host.querySelectorAll('button')[index]!.click());
  try {
    await draw('first');
    expect(state()).toEqual(['false', 'true', 'true']);
    await click(1);
    await click(0);
    await click(2);
    expect(state()).toEqual(['true', 'false', 'false']);
    await draw('second');
    expect(state()).toEqual(['true', 'true', 'false']);
    await draw('first');
    expect(state()).toEqual(['true', 'false', 'false']);
    await click(1);
    expect(state()).toEqual(['true', 'true', 'false']);
    await act(async () => root.render(null));
    await draw('first');
    expect(state()).toEqual(['false', 'true', 'true']);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
