import { DesignReviewMeasureProjection } from './tools/measure-projection';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { useAppLocale } from '../../../platform/i18n';
import { BrowserAnnotationMarkers } from '../annotation-markers/view';
import { DesignReviewFeedbackPanel } from './feedback-panel/view';
import { useDesignReviewMeasureModel } from './tools/measure';
import { DesignReviewMoveSurface } from './tools/move';
import { DesignReviewToolPanel } from './tools/panel';
import { DesignReviewPopover } from './popover/view';
import { useDesignReviewController } from './session/controller';

export function DesignReviewSurface(props: {
  controller: ReturnType<typeof useDesignReviewController>;
  showChrome: boolean;
}) {
  useAppLocale();
  const { controller, showChrome } = props;
  const measureActive =
    showChrome && controller.enabled && !controller.checkOpen && controller.tool === 'compare';
  const measureModel = useDesignReviewMeasureModel(controller.viewState.measure, measureActive);

  return (
    <>
      <BrowserAnnotationMarkers
        activeTarget={
          controller.inspectorOpen || controller.toolPanelOpen
            ? (controller.viewState.selection?.element ?? null)
            : null
        }
        interactive={showChrome && controller.enabled}
        onCloseRecord={controller.actions.close}
        onOpenRecord={controller.panel.openRecord}
        showChrome={showChrome}
      />
      {showChrome ? (
        <CommandPressScope value={true}>
          <DesignReviewFeedbackPanel
            onClose={controller.panel.close}
            onOpenRecord={controller.panel.openRecord}
            open={controller.panel.open}
          />
          {controller.enabled ? (
            <DesignReviewToolPanel
              tool={controller.tool === 'comment' ? 'inspect' : controller.tool}
              open={controller.toolPanelOpen}
              checkOpen={controller.checkOpen}
              checks={controller.checks}
              onFinding={controller.onFinding}
              workspace={controller.workspace}
              measureModel={measureModel}
              actions={controller.actions}
              state={controller.viewState}
            />
          ) : null}
          <DesignReviewMeasureProjection
            model={measureModel}
            active={
              measureActive &&
              Boolean(controller.viewState.measure?.a || controller.viewState.measure?.b)
            }
          />
          <DesignReviewMoveSurface
            enabled={controller.enabled && !controller.checkOpen && controller.tool === 'move'}
            actions={controller.actions}
            state={controller.viewState}
          />
          <DesignReviewPopover
            actions={controller.actions}
            open={controller.inspectorOpen}
            state={controller.viewState}
          />
        </CommandPressScope>
      ) : null}
    </>
  );
}

export { useDesignReviewController };
