import { translate } from '../../../platform/i18n';
import { createCanvasInsertIntent } from '@sniptale/runtime-contracts/canvas-tools';
import {
  SCENARIO_V3_ELEMENT_KINDS,
  type ScenarioV3ElementKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  CanvasInsertToolPanel,
  createCommonCanvasPointInsertAction,
  type CanvasToolAction,
  type CommonCanvasPointInsertKind,
} from '@sniptale/ui/canvas-tools';
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

const INSERT_ACTIONS = [
  {
    kind: 'text',
    labelKey: 'scenario.editor.insertText',
    target: SCENARIO_V3_ELEMENT_KINDS.text,
  },
  {
    kind: 'shape',
    labelKey: 'scenario.editor.insertShape',
    target: SCENARIO_V3_ELEMENT_KINDS.shape,
  },
  {
    kind: 'line',
    labelKey: 'scenario.editor.insertLine',
    target: SCENARIO_V3_ELEMENT_KINDS.line,
  },
  {
    kind: 'arrow',
    labelKey: 'scenario.editor.insertArrow',
    target: SCENARIO_V3_ELEMENT_KINDS.arrow,
  },
  {
    kind: 'callout',
    labelKey: 'scenario.editor.insertCallout',
    target: SCENARIO_V3_ELEMENT_KINDS.callout,
  },
  {
    kind: 'code',
    labelKey: 'scenario.editor.insertCode',
    target: SCENARIO_V3_ELEMENT_KINDS.code,
  },
] as const satisfies ReadonlyArray<{
  kind: CommonCanvasPointInsertKind;
  labelKey: string;
  target: ScenarioV3ElementKind;
}>;

export function ScenarioFloatingToolRail(props: {
  activeInsertKind: ScenarioV3ElementKind | null;
  editor: ScenarioV3FloatingEditor;
  templatePickerOpen: boolean;
  onActiveInsertKindChange: (kind: ScenarioV3ElementKind | null) => void;
  onToggleTemplatePicker: () => void;
}) {
  const actions = buildScenarioInsertActions({
    addSlide: props.editor.slideActions.addSlide,
    activeInsertKind: props.activeInsertKind,
    insertImageFile: props.editor.elementActions.insertImageFile,
    onActiveInsertKindChange: props.onActiveInsertKindChange,
    templatePickerOpen: props.templatePickerOpen,
    toggleTemplatePicker: props.onToggleTemplatePicker,
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
  activeInsertKind: ScenarioV3ElementKind | null;
  insertImageFile: (file?: File) => Promise<void> | void;
  onActiveInsertKindChange: (kind: ScenarioV3ElementKind | null) => void;
  templatePickerOpen: boolean;
  toggleTemplatePicker: () => void;
}) {
  return [
    ...INSERT_ACTIONS.map((action) =>
      createCommonCanvasPointInsertAction({
        active: props.activeInsertKind === action.target,
        group: 'primary' as const,
        kind: action.kind,
        label: translate(action.labelKey),
        target: action.target,
        onSelect: (target) =>
          props.onActiveInsertKindChange(props.activeInsertKind === target ? null : target),
      })
    ),
    createCanvasInsertToolAction({
      active: props.templatePickerOpen,
      group: 'secondary' as const,
      id: 'layouts',
      intent: createCanvasInsertIntent({ kind: 'layout', placement: 'catalog', target: 'layouts' }),
      label: translate('scenario.editor.layouts'),
      onSelect: props.toggleTemplatePicker,
    }),
    createCanvasFileInsertToolAction({
      accept: 'image/*',
      group: 'secondary' as const,
      id: 'image',
      intent: createCanvasInsertIntent({ kind: 'image', placement: 'file', target: 'image' }),
      label: translate('scenario.editor.insertImage'),
      onSelectFile: props.insertImageFile,
    }),
    createCanvasInsertToolAction({
      group: 'secondary' as const,
      id: 'add-slide',
      intent: createCanvasInsertIntent({
        kind: 'add-slide',
        placement: 'immediate',
        target: 'add-slide',
      }),
      label: translate('scenario.editor.addSlide'),
      onSelect: props.addSlide,
    }),
  ] satisfies CanvasToolAction[];
}
