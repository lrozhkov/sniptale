import { Code2, MessageSquareText, Minus, MousePointer2, Square, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3ElementKind } from '@sniptale/runtime-contracts/scenario/types/v3';
import { EditorIconButton, EditorToolbarSection } from '@sniptale/ui/editor-chrome';

const INSERT_ACTIONS = [
  {
    icon: <Type size={18} strokeWidth={2} />,
    kind: SCENARIO_V3_ELEMENT_KINDS.text,
    labelKey: 'scenario.editor.insertText',
  },
  {
    icon: <Square size={18} strokeWidth={2} />,
    kind: SCENARIO_V3_ELEMENT_KINDS.shape,
    labelKey: 'scenario.editor.insertShape',
  },
  {
    icon: <Minus size={18} strokeWidth={2} />,
    kind: SCENARIO_V3_ELEMENT_KINDS.line,
    labelKey: 'scenario.editor.insertLine',
  },
  {
    icon: <MousePointer2 size={18} strokeWidth={2} />,
    kind: SCENARIO_V3_ELEMENT_KINDS.arrow,
    labelKey: 'scenario.editor.insertArrow',
  },
  {
    icon: <MessageSquareText size={18} strokeWidth={2} />,
    kind: SCENARIO_V3_ELEMENT_KINDS.callout,
    labelKey: 'scenario.editor.insertCallout',
  },
  {
    icon: <Code2 size={18} strokeWidth={2} />,
    kind: SCENARIO_V3_ELEMENT_KINDS.code,
    labelKey: 'scenario.editor.insertCode',
  },
] as const satisfies ReadonlyArray<{
  icon: ReactNode;
  kind: ScenarioV3ElementKind;
  labelKey: string;
}>;

export function ScenarioElementInsertMenu(props: {
  onInsertElement: (kind: ScenarioV3ElementKind) => void;
}) {
  return (
    <EditorToolbarSection dataUi="scenario.toolbar.insert-menu">
      {INSERT_ACTIONS.map((action) => (
        <ScenarioInsertButton key={action.kind} action={action} onInsert={props.onInsertElement} />
      ))}
    </EditorToolbarSection>
  );
}

function ScenarioInsertButton(props: {
  action: (typeof INSERT_ACTIONS)[number];
  onInsert: (kind: ScenarioV3ElementKind) => void;
}) {
  const label = translate(props.action.labelKey);

  return (
    <EditorIconButton title={label} onClick={() => props.onInsert(props.action.kind)}>
      {props.action.icon}
    </EditorIconButton>
  );
}
