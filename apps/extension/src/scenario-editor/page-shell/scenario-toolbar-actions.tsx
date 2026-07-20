import { Bot, Download, Redo2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';

type ScenarioToolbarActionEditor = {
  canRedo: boolean;
  canUndo: boolean;
  history: {
    redo: () => void;
    undo: () => void;
  };
};

function ScenarioToolbarActionButton(props: {
  children: ReactNode;
  chrome?: boolean;
  dataUi?: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  if (props.chrome) {
    return (
      <ContentToolbarButton
        title={props.title}
        onClick={props.onClick}
        {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
        {...(props.dataUi === undefined ? {} : { dataUi: props.dataUi })}
      >
        {props.children}
      </ContentToolbarButton>
    );
  }

  return (
    <EditorIconButton
      title={props.title}
      onClick={props.onClick}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      {...(props.dataUi ? { 'data-ui': props.dataUi } : {})}
    >
      {props.children}
    </EditorIconButton>
  );
}

export function ScenarioExportActionButton(props: {
  chrome?: boolean;
  dataUi?: string;
  onOpenExport: () => void;
}) {
  return (
    <ScenarioToolbarActionButton
      title={translate('scenario.editor.export')}
      onClick={props.onOpenExport}
      {...(props.chrome === undefined ? {} : { chrome: props.chrome })}
      {...(props.dataUi === undefined ? {} : { dataUi: props.dataUi })}
    >
      <Download size={18} strokeWidth={2} />
    </ScenarioToolbarActionButton>
  );
}

export function ScenarioAiActionButton(props: {
  chrome?: boolean;
  dataUi?: string;
  onToggleAi: () => void;
}) {
  return (
    <ScenarioToolbarActionButton
      title={translate('scenario.editor.aiEditorTool')}
      onClick={props.onToggleAi}
      {...(props.chrome === undefined ? {} : { chrome: props.chrome })}
      {...(props.dataUi === undefined ? {} : { dataUi: props.dataUi })}
    >
      <Bot size={18} strokeWidth={2} />
    </ScenarioToolbarActionButton>
  );
}

export function ScenarioHistoryActionButtons(props: {
  dataUiPrefix?: string;
  editor: ScenarioToolbarActionEditor;
  iconSize?: number;
}) {
  const iconSize = props.iconSize ?? 18;
  return (
    <>
      <EditorIconButton
        disabled={!props.editor.canUndo}
        title={translate('scenario.editor.undo')}
        onClick={props.editor.history.undo}
        {...(props.dataUiPrefix ? { 'data-ui': `${props.dataUiPrefix}.undo` } : {})}
      >
        <Undo2 size={iconSize} strokeWidth={2} />
      </EditorIconButton>
      <EditorIconButton
        disabled={!props.editor.canRedo}
        title={translate('scenario.editor.redo')}
        onClick={props.editor.history.redo}
        {...(props.dataUiPrefix ? { 'data-ui': `${props.dataUiPrefix}.redo` } : {})}
      >
        <Redo2 size={iconSize} strokeWidth={2} />
      </EditorIconButton>
    </>
  );
}
