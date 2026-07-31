import { useAppLocale } from '../../../platform/i18n';
import { BrowserAnnotationMarkers } from '../annotation-markers/view';
import { DesignReviewFeedbackPanel } from './feedback-panel/view';
import { DesignReviewPopover } from './popover/view';
import { useDesignReviewController } from './session/controller';

export function DesignReviewSurface(props: {
  controller: ReturnType<typeof useDesignReviewController>;
  showChrome: boolean;
}) {
  useAppLocale();
  const { controller, showChrome } = props;

  return (
    <>
      <BrowserAnnotationMarkers
        activeTarget={
          controller.inspectorOpen ? (controller.viewState.selection?.element ?? null) : null
        }
        interactive={showChrome && controller.enabled}
        onCloseRecord={controller.actions.close}
        onOpenRecord={controller.panel.openRecord}
        showChrome={showChrome}
      />
      {showChrome ? (
        <>
          <DesignReviewFeedbackPanel
            onClose={controller.panel.close}
            onOpenRecord={controller.panel.openRecord}
            open={controller.panel.open}
          />
          <DesignReviewPopover
            actions={controller.actions}
            open={controller.inspectorOpen}
            state={controller.viewState}
          />
        </>
      ) : null}
    </>
  );
}

export { useDesignReviewController };
