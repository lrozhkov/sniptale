import { useRef } from 'react';

import { ContentToolbarButton } from '../content-toolbar';
import { FloatingChromeDivider, FloatingChromeToolbar } from '../floating-chrome';
import type { CanvasToolAction, CanvasToolGroup, CanvasToolPanelProps } from './types';

export type { CanvasToolAction, CanvasToolGroup, CanvasToolPanelProps } from './types';
export { useActiveCanvasInsertEscape } from './active-insert-escape';
export {
  createCommonCanvasPointInsertAction,
  type CommonCanvasPointInsertKind,
} from './common-insert-actions';
export { CanvasInsertPreviewOverlay } from './insert-preview';
export type { CanvasInsertPreviewFrame } from './insert-preview';

const GROUP_ORDER: readonly CanvasToolGroup[] = ['primary', 'secondary', 'workspace', 'editor'];

function groupActions(actions: readonly CanvasToolAction[]) {
  return GROUP_ORDER.map((group) => ({
    actions: actions.filter((action) => (action.group ?? 'primary') === group),
    group,
  })).filter((entry) => entry.actions.length > 0);
}

function CanvasToolButton(props: { action: CanvasToolAction; dataUi: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onClick = props.action.onSelectFile
    ? () => inputRef.current?.click()
    : props.action.onSelect;

  return (
    <>
      <ContentToolbarButton
        active={props.action.active ?? false}
        aria-pressed={props.action.active ? true : undefined}
        disabled={props.action.disabled ?? false}
        title={props.action.label}
        onClick={onClick}
        dataUi={`${props.dataUi}.${props.action.id}`}
      >
        {props.action.icon}
      </ContentToolbarButton>
      {props.action.onSelectFile ? (
        <input
          ref={inputRef}
          accept={props.action.accept}
          hidden
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = '';
            if (file) {
              void props.action.onSelectFile?.(file);
            }
          }}
        />
      ) : null}
    </>
  );
}

export function CanvasToolPanel({
  actions,
  className,
  dataUi,
  dividerClassName,
  label,
  orientation = 'horizontal',
}: CanvasToolPanelProps) {
  const groups = groupActions(actions);

  return (
    <FloatingChromeToolbar
      aria-label={label}
      dataUi={dataUi}
      className={['flex-row items-center overflow-visible', className].filter(Boolean).join(' ')}
    >
      {groups.map((group, index) => (
        <div key={group.group} className="contents">
          {index > 0 ? (
            <FloatingChromeDivider
              vertical={orientation === 'horizontal'}
              {...(dividerClassName === undefined ? {} : { className: dividerClassName })}
            />
          ) : null}
          {group.actions.map((action) => (
            <CanvasToolButton key={action.id} action={action} dataUi={dataUi} />
          ))}
        </div>
      ))}
    </FloatingChromeToolbar>
  );
}

export function CanvasInsertToolPanel(props: CanvasToolPanelProps) {
  return <CanvasToolPanel {...props} />;
}

export function CanvasWorkspaceToolPanel(props: CanvasToolPanelProps) {
  return <CanvasToolPanel {...props} />;
}
