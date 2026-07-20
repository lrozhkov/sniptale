import { ProductToggle } from '@sniptale/ui/product-form-controls';
import type { ScenarioDeckExportControlProps } from './types';

export function ScenarioDeckExportOptionToggles(props: ScenarioDeckExportControlProps) {
  return (
    <div className="grid gap-3">
      <ScenarioDeckToggleRow
        checked={props.options.includeNotes}
        label="Include speaker notes"
        hint="Adds per-slide notes blocks to HTML and Markdown exports."
        onChange={(includeNotes) => props.onChange({ ...props.options, includeNotes })}
      />
      <ScenarioDeckToggleRow
        checked={props.options.includeMissingPlaceholders}
        label="Show missing asset placeholders"
        hint="Keeps export diagnostics visible when an image asset cannot be resolved."
        onChange={(includeMissingPlaceholders) =>
          props.onChange({ ...props.options, includeMissingPlaceholders })
        }
      />
      <ScenarioDeckToggleRow
        checked={props.options.includeSourceJson}
        label="Include slide source JSON"
        hint="Adds the editable scenario document for AI/API round trips."
        onChange={(includeSourceJson) => props.onChange({ ...props.options, includeSourceJson })}
      />
    </div>
  );
}

function ScenarioDeckToggleRow(props: {
  checked: boolean;
  hint: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[8px] border
        border-[var(--sniptale-color-border-soft)] px-3 py-3"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-5 text-[var(--sniptale-color-text-secondary)]">
          {props.label}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-dim)]">{props.hint}</p>
      </div>
      <ProductToggle
        checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        aria-label={props.label}
      />
    </div>
  );
}
