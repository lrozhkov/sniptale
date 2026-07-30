import { useAppLocale } from '../../../platform/i18n';
import { BrowserAnnotationMarkers } from '../annotation-markers/view';
import { DesignReviewPopover } from './popover/view';
import { useDesignReviewController } from './session/controller';

export function DesignReviewSurface(props: {
  controller: ReturnType<typeof useDesignReviewController>;
}) {
  useAppLocale();
  const { controller } = props;

  return (
    <>
      <BrowserAnnotationMarkers />
      <DesignReviewPopover
        actions={controller.actions}
        open={controller.inspectorOpen}
        state={controller.viewState}
      />
    </>
  );
}

export { useDesignReviewController };
