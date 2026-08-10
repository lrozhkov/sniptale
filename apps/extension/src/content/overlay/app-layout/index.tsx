import { Suspense } from 'react';
import { ContentDialogStack } from './dialogs';
import { DesignReviewSurface, useDesignReviewController } from '../design-review/view';
import { LazyContentScenarioRecorderSidebar } from './sidebar-lazy';
import { shouldRenderContentScenarioRecorderSidebar } from './sidebar-visibility';
import { ContentToolbarShell } from './toolbar';
import type { ContentAppLayoutProps } from './types';
import { DrawingSurface } from '../../drawing/surface';

function ContentScenarioRecorderSidebarSlot(props: {
  isCompletelyHidden: boolean;
  modeController: ContentAppLayoutProps['toolbar']['modeController'];
  scenario: ContentAppLayoutProps['scenario'];
  setPinToTab: ContentAppLayoutProps['toolbar']['setPinToTab'];
}) {
  if (
    !shouldRenderContentScenarioRecorderSidebar({
      isCompletelyHidden: props.isCompletelyHidden,
      scenario: props.scenario,
    })
  ) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyContentScenarioRecorderSidebar
        isCompletelyHidden={props.isCompletelyHidden}
        modeController={props.modeController}
        scenario={props.scenario}
        setPinToTab={props.setPinToTab}
      />
    </Suspense>
  );
}

export function ContentAppLayout(props: ContentAppLayoutProps) {
  const isCaptureUiHidden = props.toolbar.isCompletelyHidden;
  const designReview = useDesignReviewController({
    enabled: props.toolbar.modes.designReviewMode,
  });

  return (
    <>
      {props.toolbar.modes.screenshotMode && props.toolbar.drawingController ? (
        <DrawingSurface
          active={props.toolbar.modes.drawingMode === true}
          chromeHidden={isCaptureUiHidden}
          controller={props.toolbar.drawingController}
          {...(props.toolbar.modeController.handleToggleDrawingMode === undefined
            ? {}
            : { onExit: () => props.toolbar.modeController.handleToggleDrawingMode?.(false) })}
        />
      ) : null}
      <ContentToolbarShell
        designReview={designReview}
        scenario={props.scenario}
        toolbar={props.toolbar}
      />
      {props.toolbar.modes.screenshotMode && props.toolbar.modes.drawingMode !== true ? (
        <DesignReviewSurface controller={designReview} showChrome={!isCaptureUiHidden} />
      ) : null}
      <ContentScenarioRecorderSidebarSlot
        isCompletelyHidden={props.toolbar.isCompletelyHidden}
        modeController={props.toolbar.modeController}
        scenario={props.scenario}
        setPinToTab={props.toolbar.setPinToTab}
      />
      {isCaptureUiHidden ? null : <ContentDialogStack dialogs={props.dialogs} />}
    </>
  );
}
