import { translate } from '../../../platform/i18n';
import { createCanvasInsertIntent } from '@sniptale/runtime-contracts/canvas-tools';
import { CanvasInsertToolPanel, type CanvasToolAction } from '@sniptale/ui/canvas-tools';
import {
  createCanvasFileInsertToolAction,
  createCanvasInsertToolAction,
} from '@sniptale/ui/canvas-tools/descriptors';
import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { ScenarioV3FloatingEditor } from './types';

const INSERT_PANEL_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute left-1/2 top-3 z-40 flex -translate-x-1/2 flex-col items-center gap-3',
  'max-[720px]:bottom-3 max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-auto',
  'max-[720px]:translate-x-0'
);

const INSERT_PANEL_CLASS_NAME = floatingChromeClassNames(
  'flex flex-row items-center overflow-visible',
  'max-[720px]:max-h-none max-[720px]:w-full max-[720px]:flex-wrap',
  'max-[720px]:content-start max-[720px]:gap-1 max-[720px]:overflow-visible'
);

export function ScenarioFloatingToolRail(props: { editor: ScenarioV3FloatingEditor }) {
  const actions = buildScenarioInsertActions({
    addSlide: props.editor.slideActions.addSlide,
    insertImageFile: props.editor.elementActions.insertImageFile,
  });

  return (
    <div data-ui="scenario.floating.insert-panel.stack" className={INSERT_PANEL_STACK_CLASS_NAME}>
      <CanvasInsertToolPanel
        actions={actions}
        dataUi="scenario.floating.insert-panel"
        label={translate('scenario.editor.insertElement')}
        className={INSERT_PANEL_CLASS_NAME}
      />
    </div>
  );
}

function buildScenarioInsertActions(props: {
  addSlide: () => void;
  insertImageFile: (file?: File) => Promise<void> | void;
}) {
  return [
    createCanvasFileInsertToolAction({
      accept: 'image/*',
      group: 'primary' as const,
      id: 'image',
      intent: createCanvasInsertIntent({ kind: 'image', placement: 'file', target: 'image' }),
      label: translate('scenario.editor.addScreenshot'),
      onSelectFile: props.insertImageFile,
    }),
    createCanvasInsertToolAction({
      group: 'primary' as const,
      id: 'add-slide',
      intent: createCanvasInsertIntent({
        kind: 'add-slide',
        placement: 'immediate',
        target: 'add-slide',
      }),
      label: translate('scenario.editor.addStep'),
      onSelect: props.addSlide,
    }),
  ] satisfies CanvasToolAction[];
}
