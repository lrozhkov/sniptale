import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  COMPACT_POPOVER_CLOSE_BUTTON_CLASSNAME,
  COMPACT_POPOVER_SURFACE_CLASSNAME,
  COMPACT_POPOVER_TRIGGER_CLASSNAME,
} from './constants';

interface EditorInspectorCompactPopoverProps {
  title: string;
  value?: string;
  trigger: React.ReactNode;
  style: React.CSSProperties;
  popoverRef: React.Ref<HTMLDivElement>;
  onClose: () => void;
  children: React.ReactNode;
}

function CompactPopoverHeader(
  props: Pick<EditorInspectorCompactPopoverProps, 'title' | 'value' | 'trigger' | 'onClose'>
) {
  const headerClassName = [
    'mb-4 flex items-start justify-between gap-3 border-b',
    'border-[color:var(--sniptale-color-border-soft)] pb-3',
  ].join(' ');

  return (
    <div className={headerClassName}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={COMPACT_POPOVER_TRIGGER_CLASSNAME}>{props.trigger}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug text-[color:var(--sniptale-color-text-primary)]">
            {props.title}
          </div>
          {props.value ? (
            <div className="text-xs leading-snug text-[color:var(--sniptale-color-text-secondary)]">
              {props.value}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={props.onClose}
        className={COMPACT_POPOVER_CLOSE_BUTTON_CLASSNAME}
        aria-label={translate('editor.runtime.closePopoverAria')}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

export function EditorInspectorCompactPopover({
  title,
  value,
  trigger,
  style,
  popoverRef,
  onClose,
  children,
}: EditorInspectorCompactPopoverProps): React.ReactPortal | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const headerValueProps = value === undefined ? {} : { value };

  return createPortal(
    <div
      ref={popoverRef}
      data-ui="editor.inspector.compact-popover"
      data-floating-ui-root="true"
      style={style}
      className={COMPACT_POPOVER_SURFACE_CLASSNAME}
    >
      <CompactPopoverHeader
        title={title}
        trigger={trigger}
        onClose={onClose}
        {...headerValueProps}
      />
      <div className="max-h-[min(34rem,calc(100vh-3rem))] overflow-y-auto pr-1">{children}</div>
    </div>,
    document.body
  );
}
