import React from 'react';

import {
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECONDARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECTION_HEADER_CLASS_NAME,
  INSPECTOR_SECTION_LABEL_CLASS_NAME,
  INSPECTOR_SECTION_SURFACE_CLASS_NAME,
  INSPECTOR_SECTION_VALUE_CLASS_NAME,
} from '../chrome';
import { OptionRow, cx } from '../../chrome/ui';

export const primaryPanelButtonClassName = INSPECTOR_PRIMARY_BUTTON_CLASS_NAME;

export const secondaryPanelButtonClassName = INSPECTOR_SECONDARY_BUTTON_CLASS_NAME;

interface PanelSectionProps {
  label: string;
  value?: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  hideHeader?: boolean;
  labelClassName?: string;
  surfaceClassName?: string;
  valueClassName?: string;
}

const DEFAULT_PANEL_SECTION_SURFACE_CLASS_NAME = INSPECTOR_SECTION_SURFACE_CLASS_NAME;
const DEFAULT_PANEL_SECTION_HEADER_CLASS_NAME = INSPECTOR_SECTION_HEADER_CLASS_NAME;
const DEFAULT_PANEL_SECTION_LABEL_CLASS_NAME = INSPECTOR_SECTION_LABEL_CLASS_NAME;
const DEFAULT_PANEL_SECTION_VALUE_CLASS_NAME = INSPECTOR_SECTION_VALUE_CLASS_NAME;

function normalizePanelLabel(label: React.ReactNode): string | null {
  return typeof label === 'string' ? label.trim().toLocaleLowerCase() : null;
}

function getSingleChildLabel(children: React.ReactNode): string | null {
  const childNodes = React.Children.toArray(children).filter(
    (child) => typeof child !== 'string' || child.trim().length > 0
  );
  if (childNodes.length !== 1) {
    return null;
  }
  const child = childNodes[0];
  if (!React.isValidElement(child)) {
    return null;
  }
  const props = child.props as { label?: unknown };
  return typeof props.label === 'string' ? props.label : null;
}

function shouldHidePanelHeader(args: {
  children: React.ReactNode;
  hideHeader?: boolean | undefined;
  label: string;
}) {
  if (args.hideHeader) {
    return true;
  }
  return (
    normalizePanelLabel(args.label) === normalizePanelLabel(getSingleChildLabel(args.children))
  );
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  label,
  value,
  children,
  className,
  headerClassName,
  hideHeader,
  labelClassName,
  surfaceClassName,
  valueClassName,
}) => {
  const omitHeader = shouldHidePanelHeader({ children, hideHeader, label });
  return (
    <section
      className={cx(surfaceClassName ?? DEFAULT_PANEL_SECTION_SURFACE_CLASS_NAME, className)}
    >
      {omitHeader ? null : (
        <div className={headerClassName ?? DEFAULT_PANEL_SECTION_HEADER_CLASS_NAME}>
          <span className={labelClassName ?? DEFAULT_PANEL_SECTION_LABEL_CLASS_NAME}>{label}</span>
          {value ? (
            <span className={valueClassName ?? DEFAULT_PANEL_SECTION_VALUE_CLASS_NAME}>
              {value}
            </span>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
};

export function HeaderValueToggleSection<T extends string>(props: {
  active?: boolean;
  ariaLabel: string;
  label: string;
  nextValue: T;
  onChange: (next: T) => void;
  value: string;
}) {
  if (props.active !== undefined) {
    return (
      <OptionRow
        active={props.active}
        label={props.label}
        value={props.value}
        onToggle={() => props.onChange(props.nextValue)}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      onClick={() => props.onChange(props.nextValue)}
      className={cx(
        'flex min-h-10 w-full items-center justify-between gap-3 rounded-[10px] border px-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        'text-left transition hover:border-[color:var(--sniptale-color-border-strong)]'
      )}
    >
      <span
        className="min-w-0 truncate text-[12px] font-semibold text-[color:var(--sniptale-color-text-secondary)]"
        title={props.label}
      >
        {props.label}
      </span>
      <span
        className="shrink-0 text-right text-[12px] font-semibold text-[color:var(--sniptale-color-text-primary)]"
        title={props.value}
      >
        {props.value}
      </span>
    </button>
  );
}
