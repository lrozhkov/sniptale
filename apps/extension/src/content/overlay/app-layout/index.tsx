import { Suspense } from 'react';
import { ContentDialogStack } from './dialogs';
import {
  PageStyleInspectorSurface,
  usePageStyleInspectorController,
} from '../page-style-inspector/view';
import { LazyContentScenarioRecorderSidebar } from './sidebar-lazy';
import { shouldRenderContentScenarioRecorderSidebar } from './sidebar-visibility';
import { ContentToolbarShell } from './toolbar';
import type { ContentAppLayoutProps } from './types';

function ContentScenarioRecorderSidebarSlot(props: {
  isCompletelyHidden: boolean;
  modeController: ContentAppLayoutProps['toolbar']['modeController'];
  scenario: ContentAppLayoutProps['scenario'];
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
      />
    </Suspense>
  );
}

export function ContentAppLayout(props: ContentAppLayoutProps) {
  const isCaptureUiHidden = props.toolbar.isCompletelyHidden;
  const pageStyleInspector = usePageStyleInspectorController({
    quickEditDocumentMode: props.toolbar.modes.quickEditDocumentMode,
    quickEditMode: props.toolbar.modes.quickEditMode,
  });
  const toolbar = props.toolbar.modes.quickEditMode
    ? {
        ...props.toolbar,
        pageStyleInspector: {
          open: pageStyleInspector.inspectorOpen,
          onToggle: pageStyleInspector.toggleInspector,
        },
      }
    : props.toolbar;

  return (
    <>
      <ContentToolbarShell scenario={props.scenario} toolbar={toolbar} />
      {isCaptureUiHidden ? null : <PageStyleInspectorSurface controller={pageStyleInspector} />}
      <ContentScenarioRecorderSidebarSlot
        isCompletelyHidden={props.toolbar.isCompletelyHidden}
        modeController={props.toolbar.modeController}
        scenario={props.scenario}
      />
      {isCaptureUiHidden ? null : <ContentDialogStack dialogs={props.dialogs} />}
    </>
  );
}
