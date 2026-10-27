import { useState, type ReactNode } from 'react';
import './disclosure.css';
import { ChevronDown, Info } from 'lucide-react';
import type { InspectorDisclosureProps } from './shared';
/** Native disclosure presentation; workspace owners retain preference identity and persistence. */
export function InspectorDisclosureView(
  props: Omit<InspectorDisclosureProps, 'preferenceId' | 'initiallyOpen'> & {
    dataUi: string;
    summary?: string;
    variant?: 'structural' | 'information';
    bodyClassName: string;
    open: boolean;
    onOpenChange(open: boolean): void;
  }
) {
  const level = props.level ?? 'group';
  const Heading = level === 'section' ? 'h3' : 'h4';
  const Icon = props.icon ?? (props.variant === 'information' ? Info : undefined);
  return (
    <details
      data-ui={props.dataUi}
      className={props.variant ? 'sniptale-disclosure' : undefined}
      data-variant={props.variant ?? 'structural'}
      data-level={level}
      open={props.open}
      onToggle={(event) => {
        if (event.currentTarget.open !== props.open) props.onOpenChange(event.currentTarget.open);
      }}
    >
      <summary>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        {props.variant === 'information' ? (
          <span>{props.label}</span>
        ) : (
          <Heading>
            {props.summary ? (
              <>
                <span className="sniptale-disclosure-label">{props.label}</span>
                <span className="sniptale-disclosure-value">{props.summary}</span>
              </>
            ) : (
              props.label
            )}
          </Heading>
        )}
        <ChevronDown size={level === 'section' ? 16 : 14} aria-hidden="true" />
      </summary>
      <div className={props.bodyClassName}>{props.children}</div>
    </details>
  );
}

/** Optional prose only. Feature owners retain warnings, editable fields, and persistence. */
export function InformationDisclosure(props: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <InspectorDisclosureView
      dataUi="shared.information-disclosure"
      variant="information"
      label={props.label}
      open={open}
      onOpenChange={setOpen}
      bodyClassName="sniptale-information-body"
    >
      {props.children}
    </InspectorDisclosureView>
  );
}
