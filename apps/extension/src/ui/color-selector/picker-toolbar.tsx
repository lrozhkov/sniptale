import { Ban, Pipette } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { CompactRange } from '../compact-inspector-controls/primitives';

const ICON_ACTION_CLASS_NAME = [
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-none px-0',
  'bg-transparent text-[var(--sniptale-color-text-muted-strong)] shadow-none outline-none transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)] active:translate-y-px',
  'active:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'focus-visible:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
  'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
].join(' ');

function TransparentPreviewButton(props: { onClick: () => void; resolvedColor: string }) {
  return (
    <button
      type="button"
      aria-label={translate('shared.ui.colorSelectorTransparent')}
      title={translate('shared.ui.colorSelectorTransparent')}
      data-ui="shared.ui.color-selector.transparent"
      onClick={props.onClick}
      className={[
        'relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border',
        'border-[color:var(--sniptale-color-border-soft)] bg-transparent shadow-none outline-none transition',
        'hover:border-[color:var(--sniptale-color-border-strong)] hover:brightness-105',
        'focus-visible:outline-none',
        'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
        'active:translate-y-px',
      ].join(' ')}
      style={{ backgroundColor: props.resolvedColor }}
    >
      <Ban size={18} className="relative z-10 text-[var(--sniptale-color-text-primary)]" />
    </button>
  );
}

function EyedropperActionButton(props: {
  eyedropperPressed: boolean;
  handleEyedropperPick: () => Promise<void>;
}) {
  return (
    <button
      type="button"
      aria-label={translate('shared.ui.colorSelectorEyedropper')}
      title={translate('shared.ui.colorSelectorEyedropper')}
      data-pressed={props.eyedropperPressed ? 'true' : 'false'}
      onClick={() => void props.handleEyedropperPick()}
      data-ui="shared.ui.color-selector.eyedropper"
      className={[
        ICON_ACTION_CLASS_NAME,
        props.eyedropperPressed &&
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,transparent)]',
        props.eyedropperPressed && 'text-[var(--sniptale-color-text-primary)]',
        props.eyedropperPressed &&
          'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Pipette size={18} />
    </button>
  );
}

export function PickerToolbar(props: {
  eyedropperAvailable: boolean;
  eyedropperPressed: boolean;
  handleEyedropperPick: () => Promise<void>;
  hue: number;
  onHueChange: (nextHue: string) => void;
  onSelectTransparent: () => void;
  resolvedColor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <TransparentPreviewButton
        onClick={props.onSelectTransparent}
        resolvedColor={props.resolvedColor}
      />
      <CompactRange
        aria-label={translate('shared.ui.colorSelectorChooseColor')}
        min={0}
        max={359}
        value={Math.round(props.hue)}
        onChange={(event) => props.onHueChange(event.target.value)}
        className="sniptale-color-selector-hue-range h-9 w-full"
      />
      {props.eyedropperAvailable ? (
        <EyedropperActionButton
          eyedropperPressed={props.eyedropperPressed}
          handleEyedropperPick={props.handleEyedropperPick}
        />
      ) : null}
    </div>
  );
}
