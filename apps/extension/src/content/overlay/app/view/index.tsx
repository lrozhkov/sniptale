import React, { useLayoutEffect, useRef, useState } from 'react';
import { installContentRuntimeReleaseGuard } from '../../../runtime/entrypoint/markers';

import { preloadAIModal } from '../../ai/modal/shell/lazy';
import { ContentAppLayout } from '../../app-layout';
import { buildContentAppLayoutProps } from '../../app-layout/props';
import { InteractiveFrame } from '../../../selection/interactive-frame';
import { useContentAppViewModel } from '../view-state/hook';

export const App: React.FC = () => {
  const viewModel = useContentAppViewModel({
    InteractiveFrameComponent: InteractiveFrame,
    preloadAIModal,
  });
  const [queryRevision, setQueryRevision] = useState(0);
  const nextQuery = useRef(0);
  const pending = useRef<Array<{ revision: number; resolve: (allowed: boolean) => void }>>([]);
  const state = viewModel.modeState;
  const releaseAllowed = !(
    state.screenshotMode ||
    state.videoRecordingMode ||
    state.drawingMode ||
    state.highlighterMode ||
    state.quickEditMode ||
    state.quickEditDocumentMode ||
    state.aiPickMode ||
    state.designReviewMode ||
    state.pinToTab ||
    state.pinToTabConfirmed ||
    state.isCompletelyHidden ||
    state.saveDialogState ||
    state.quickActionOverlayRef.current ||
    viewModel.scenarioController.scenarioEnabled ||
    viewModel.screenshotController.countdown !== null ||
    viewModel.frameManager.frames.length > 0 ||
    viewModel.aiController.isAIModalOpen
  );
  useLayoutEffect(() => {
    const dispose = installContentRuntimeReleaseGuard(
      () =>
        new Promise<boolean>((resolve) => {
          const revision = ++nextQuery.current;
          pending.current.push({ revision, resolve });
          setQueryRevision(revision);
        })
    );
    return () => {
      dispose();
      for (const query of pending.current) query.resolve(false);
      pending.current = [];
    };
  }, []);
  useLayoutEffect(() => {
    const ready = pending.current.filter((query) => query.revision <= queryRevision);
    pending.current = pending.current.filter((query) => query.revision > queryRevision);
    for (const query of ready) query.resolve(releaseAllowed);
  }, [queryRevision, releaseAllowed]);
  const layoutProps = buildContentAppLayoutProps(viewModel);

  return <ContentAppLayout {...layoutProps} />;
};
