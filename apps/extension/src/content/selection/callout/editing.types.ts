import type {
  ClipboardEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  RefObject,
} from 'react';

export type CalloutEditingHandlersArgs = {
  contentEditableRef: RefObject<HTMLDivElement | null>;
  frameId: string;
  isEditing: boolean;
  onContentChange: (htmlContent: string) => void;
  onDelete: () => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
};

export type CalloutEditingHandlers = {
  applyFormatting: (command: string, event: MouseEvent) => void;
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
  handleBlur: (event?: ReactFocusEvent<HTMLDivElement>) => void;
  handleClick: (event: MouseEvent) => void;
  handleInput: () => void;
  handleKeyDown: (event: ReactKeyboardEvent) => void;
  handlePaste: (event: ClipboardEvent) => void;
};
