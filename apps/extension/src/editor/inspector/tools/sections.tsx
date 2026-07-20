import { ChevronDown, ChevronRight } from 'lucide-react';
import React from 'react';
import { useState } from 'react';
import {
  INSPECTOR_SECTION_HEADER_CLASS_NAME,
  INSPECTOR_SECTION_LABEL_CLASS_NAME,
  INSPECTOR_SECTION_SURFACE_CLASS_NAME,
  INSPECTOR_SECTION_VALUE_CLASS_NAME,
} from '../chrome';
import { PanelSection as BasePanelSection } from '../scene/shared';
import { OptionRow, cx } from '../../chrome/ui';
import type { EditorInspectorToolsPanelProps } from './types';

export const PanelSection: React.FC<React.ComponentProps<typeof BasePanelSection>> = (props) => (
  <BasePanelSection
    {...props}
    surfaceClassName={cx(
      INSPECTOR_SECTION_SURFACE_CLASS_NAME,
      'rounded-[var(--sniptale-radius-xl)]'
    )}
    labelClassName={INSPECTOR_SECTION_LABEL_CLASS_NAME}
    valueClassName={INSPECTOR_SECTION_VALUE_CLASS_NAME}
  />
);

export function HeaderValueToggleSection(props: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
  value: string;
}) {
  return (
    <OptionRow
      active={props.active}
      disabled={props.disabled}
      label={props.label}
      value={props.value}
      onToggle={props.onToggle}
    />
  );
}

export function CollapsibleSection(props: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  label: string;
  value?: string;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);

  return (
    <section className={INSPECTOR_SECTION_SURFACE_CLASS_NAME}>
      <button
        type="button"
        aria-expanded={open}
        className={cx(INSPECTOR_SECTION_HEADER_CLASS_NAME, 'w-full items-center px-0 text-left')}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="flex min-w-0 items-center gap-1">
          {open ? (
            <ChevronDown
              aria-hidden="true"
              size={14}
              strokeWidth={2.4}
              className="shrink-0 text-[color:var(--sniptale-color-text-muted)]"
            />
          ) : (
            <ChevronRight
              aria-hidden="true"
              size={14}
              strokeWidth={2.4}
              className="shrink-0 text-[color:var(--sniptale-color-text-muted)]"
            />
          )}
          <span className="text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]">
            {props.label}
          </span>
        </span>
        {props.value ? (
          <span className={INSPECTOR_SECTION_VALUE_CLASS_NAME}>{props.value}</span>
        ) : null}
      </button>
      {open ? props.children : null}
    </section>
  );
}

type SelectionActionsSectionProps = Pick<
  EditorInspectorToolsPanelProps,
  'selection' | 'canDeleteSelection' | 'selectionDuplicateIcon' | 'selectionDeleteIcon'
> & {
  panelButtonClassName: string;
};

function renderSelectionActionsSectionWithController(
  _props: SelectionActionsSectionProps,
  _controller?: unknown
) {
  return null;
}

export { renderSelectionActionsSectionWithController };
