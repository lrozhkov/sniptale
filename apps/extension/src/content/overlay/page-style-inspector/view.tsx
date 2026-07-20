import { useEffect } from 'react';
import {
  hideQuickEditPageStyleFrame,
  showQuickEditPageStyleFrame,
} from '../../selection/quick-edit-runtime/page-style-frame';
import { PageStyleInspectorPanel } from './panel/view';
import { usePageStyleInspectorController } from './session/controller';

function useQuickEditPageStyleSelectionFrame(element: HTMLElement | null, visible: boolean) {
  useEffect(() => {
    if (!visible || !element) {
      hideQuickEditPageStyleFrame();
      return;
    }

    const targetElement = element;

    function updateFrame() {
      showQuickEditPageStyleFrame(targetElement);
    }

    updateFrame();
    window.addEventListener('resize', updateFrame);
    window.addEventListener('scroll', updateFrame, true);
    return () => {
      window.removeEventListener('resize', updateFrame);
      window.removeEventListener('scroll', updateFrame, true);
      hideQuickEditPageStyleFrame();
    };
  }, [element, visible]);
}

export function PageStyleInspectorSurface(props: {
  controller: ReturnType<typeof usePageStyleInspectorController>;
}) {
  const { controller } = props;
  useQuickEditPageStyleSelectionFrame(
    controller.viewState.selection?.element ?? null,
    controller.inspectorOpen
  );

  return (
    <PageStyleInspectorPanel
      actions={controller.actions}
      open={controller.inspectorOpen}
      state={controller.viewState}
    />
  );
}

export { usePageStyleInspectorController };
