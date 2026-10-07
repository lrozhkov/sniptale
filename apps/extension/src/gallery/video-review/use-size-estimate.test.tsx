// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import { useReviewSizeEstimate } from './use-size-estimate';
const mocks = vi.hoisted(() => ({ estimate: vi.fn() }));
vi.mock('../../workflows/video-review/estimate-size', () => ({
  estimateReviewExportSize: mocks.estimate,
}));

it.each(['overlays', 'zoom', 'audio'] as const)(
  'invalidates %s estimates for local UI edits with autosave disabled',
  async (toggle) => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.estimate
      .mockReset()
      .mockResolvedValue({ bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 1 });
    const advanced = createQuickEditAdvancedState();
    advanced.ui.mode = 'advanced';
    const source = { duration: 6, width: 160, height: 90, mimeType: 'video/webm', size: 5 };
    const snapshot = {
      workspace: {
        aggregateId: 'recording:r',
        sourceAssetId: 'original',
        formatVersion: 1 as const,
        source,
        revision: 1,
        cursor: 0,
        history: [],
        advanced,
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    };
    const resource: LoadedReview = {
      source,
      snapshot,
      file: new File(['video'], 'clip.webm'),
      filename: 'clip.webm',
      telemetry: null,
      url: 'blob:original',
      session: createVideoReviewSession(snapshot),
    };
    resource.session.setAutosaveEnabled(false);
    const originalDocument = resource.session.getSnapshot().document;
    const root = createRoot(document.createElement('div'));
    let state!: ReturnType<typeof useReviewSizeEstimate>;
    let adaptive = false;
    function Harness() {
      state = useReviewSizeEstimate({
        resource,
        context: 'unchanged-revision-1',
        enabled: true,
        index: {
          duration: 6,
          boundaries: [0, 6],
          container: 'webm',
          videoCodec: 'vp9',
          audioCodec: null,
          rotation: 0,
          width: 160,
          height: 90,
          frameRate: 30,
        },
        renderSettings: {
          codec: 'vp9',
          frameRate: adaptive ? 60 : 30,
          quality: 'HIGH',
          frameRateMode: adaptive ? 'adaptive' : 'constant',
        },
      });
      return null;
    }
    try {
      await act(async () => root.render(<Harness />));
      await act(async () => state.setVisible(true));
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(state.status?.kind).toBe('ready');
      const updated = structuredClone(resource.session.getSnapshot().snapshot.workspace.advanced);
      if (toggle === 'overlays') updated.ui.overlaysVisible = !updated.ui.overlaysVisible;
      else updated.ui.tracks[toggle] = !updated.ui.tracks[toggle];
      await act(async () => {
        await resource.session.saveAdvanced(updated);
        root.render(<Harness />);
      });
      expect(resource.session.getSnapshot().snapshot.workspace.revision).toBe(1);
      expect(resource.session.getSnapshot().document).toEqual(originalDocument);
      expect(state.status?.kind).toBe('pending');
      adaptive = true;
      await act(async () => root.render(<Harness />));
      expect(state.status).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(mocks.estimate).toHaveBeenCalledOnce();
      adaptive = false;
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(mocks.estimate).toHaveBeenCalledTimes(2);
      expect(mocks.estimate.mock.lastCall?.[0].advanced.ui).toEqual(updated.ui);
      expect(state.status?.kind).toBe('ready');
      adaptive = true;
      await act(async () => root.render(<Harness />));
      expect(state.status).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(mocks.estimate).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  }
);
