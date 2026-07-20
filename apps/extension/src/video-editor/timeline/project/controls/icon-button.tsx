import { useRef, type ReactNode } from 'react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';

const TIMELINE_ICON_BUTTON_CLASS_NAME = '!h-6 !w-6 !rounded-md';

export function TimelineIconButton(props: {
  active?: boolean | undefined;
  danger?: boolean | undefined;
  dataUi?: string | undefined;
  disabled?: boolean | undefined;
  icon: ReactNode;
  stopPropagation?: boolean | undefined;
  title: string;
  onClick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const button = (
    <EditorIconButton
      ref={buttonRef}
      title={props.title}
      onClick={() => {
        buttonRef.current?.blur();
        props.onClick();
      }}
      className={TIMELINE_ICON_BUTTON_CLASS_NAME}
      data-ui={props.dataUi ?? 'video-editor.timeline.icon-button'}
      {...(props.active === undefined ? {} : { active: props.active })}
      {...(props.danger === undefined ? {} : { danger: props.danger })}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
    >
      {props.icon}
    </EditorIconButton>
  );

  if (!props.stopPropagation) {
    return button;
  }

  return (
    <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
      {button}
    </span>
  );
}
