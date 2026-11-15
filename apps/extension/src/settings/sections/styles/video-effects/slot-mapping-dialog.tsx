import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ProductModal,
  ProductModalHeader,
  ProductModalBody,
  ProductModalFooter,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductField,
  ProductInput,
  ProductSelect,
  ProductToggle,
} from '@sniptale/ui/product-form-controls';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import {
  listAnimationTemplateSlots,
  type AnimationTemplateSlot,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { settingsModalClassName } from '../../../section-surface';
import {
  createSlotMappingDrafts,
  prepareSlotMappedAnimation,
  type SlotMappingDraft,
  type SlotMappingUnit,
} from './slot-mapping-model';

const keys = {
  text: 'videoEditor.effectsLibrary.mapping.text',
  color: 'videoEditor.effectsLibrary.mapping.color',
  scalar: 'videoEditor.effectsLibrary.mapping.scalar',
  vector: 'videoEditor.effectsLibrary.mapping.vector',
  animated: 'videoEditor.effectsLibrary.mapping.animated',
  unsupported: 'videoEditor.effectsLibrary.mapping.unsupported',
  bound: 'videoEditor.effectsLibrary.mapping.bound',
  layout: 'videoEditor.effectsLibrary.mapping.layout',
} as const;
const unitKeys = {
  identity: 'videoEditor.effectsLibrary.mapping.identity',
  'percent-to-ratio': 'videoEditor.effectsLibrary.mapping.percent',
  'degrees-to-radians': 'videoEditor.effectsLibrary.mapping.degrees',
  'normalized-to-pixels': 'videoEditor.effectsLibrary.mapping.normalized',
} as const;
function stepBound(value: string, direction: 1 | -1): string {
  if (!value.trim()) return value;
  const number = Number(value);
  const next = number + direction;
  return Number.isFinite(number) && Number.isFinite(next) ? String(next) : value;
}
function SlotFields(props: {
  slot: AnimationTemplateSlot;
  draft: SlotMappingDraft;
  busy: boolean;
  change(patch: Partial<SlotMappingDraft>): void;
}) {
  const { slot, draft } = props;
  const numeric = slot.kind === 'scalar' || slot.kind === 'vector';
  const units: SlotMappingUnit[] =
    slot.kind === 'scalar'
      ? ['identity', 'percent-to-ratio', 'degrees-to-radians']
      : ['identity', 'normalized-to-pixels'];
  return (
    <section className="space-y-2 py-2" data-mapping-slot={slot.id}>
      <div className="flex min-w-0 items-center gap-2">
        <ProductToggle
          size="sm"
          aria-label={slot.id}
          checked={draft.enabled}
          disabled={props.busy || slot.unavailable !== null}
          onClick={() => props.change({ enabled: !draft.enabled })}
        />
        <span className="min-w-0 flex-1 break-words text-[13px] font-medium">{slot.id}</span>
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {slot.kind ? translate(keys[slot.kind]) : null}
        </span>
      </div>
      {slot.unavailable ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate(keys[slot.unavailable])}
        </p>
      ) : null}
      {draft.enabled ? (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <ProductField label={translate('videoEditor.effectsLibrary.mapping.parameterName')}>
            <ProductInput
              aria-label={
                translate('videoEditor.effectsLibrary.mapping.parameterName') + ' ' + slot.id
              }
              value={draft.label}
              maxLength={128}
              disabled={props.busy}
              onChange={(event) => props.change({ label: event.target.value })}
            />
          </ProductField>
          {numeric ? (
            <>
              <ProductField label={translate('videoEditor.effectsLibrary.mapping.unit')}>
                <ProductSelect<SlotMappingUnit>
                  value={draft.unit}
                  disabled={props.busy}
                  controlSize="sm"
                  aria-label={translate('videoEditor.effectsLibrary.mapping.unit') + ' ' + slot.id}
                  options={units.map((value) => ({ value, label: translate(unitKeys[value]) }))}
                  onChange={(unit) => props.change({ unit })}
                />
              </ProductField>
              <ProductField label={translate('videoEditor.effectsLibrary.mapping.minimum')}>
                <ProductInput
                  inputMode="decimal"
                  value={draft.minimum}
                  onNumericStep={(direction) =>
                    props.change({ minimum: stepBound(draft.minimum, direction) })
                  }
                  disabled={props.busy}
                  aria-label={
                    translate('videoEditor.effectsLibrary.mapping.minimum') + ' ' + slot.id
                  }
                  onChange={(event) => props.change({ minimum: event.target.value })}
                />
              </ProductField>
              <ProductField label={translate('videoEditor.effectsLibrary.mapping.maximum')}>
                <ProductInput
                  inputMode="decimal"
                  value={draft.maximum}
                  onNumericStep={(direction) =>
                    props.change({ maximum: stepBound(draft.maximum, direction) })
                  }
                  disabled={props.busy}
                  aria-label={
                    translate('videoEditor.effectsLibrary.mapping.maximum') + ' ' + slot.id
                  }
                  onChange={(event) => props.change({ maximum: event.target.value })}
                />
              </ProductField>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
export function AnimationSlotMappingDialog(props: {
  template: AnimationTemplate;
  copyId: string;
  anchor: HTMLElement | null;
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onSave(template: AnimationTemplate): Promise<boolean>;
}) {
  const locale = useAppLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const theme = useResolvedPortalTheme(props.anchor);
  const [label, setLabel] = useState(() =>
    translate('videoEditor.effectsLibrary.mapping.copyName').replace(
      '{name}',
      props.template.label[locale] ?? props.template.label.en
    )
  );
  const [drafts, setDrafts] = useState(() => createSlotMappingDrafts(props.template));
  const slots = useMemo(() => listAnimationTemplateSlots(props.template), [props.template]);
  const selected = drafts.some((draft) => draft.enabled);
  const prepared = useMemo(() => {
    try {
      return prepareSlotMappedAnimation({
        template: props.template,
        id: props.copyId,
        label,
        drafts,
      });
    } catch {
      return null;
    }
  }, [props.template, props.copyId, label, drafts]);
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = props.anchor ?? document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, [props.anchor]);
  const close = () => {
    if (!props.busy) props.onCancel();
  };
  return createPortal(
    <dialog
      ref={dialog}
      data-theme={theme ?? undefined}
      aria-labelledby={heading}
      data-ui="settings.animation-slot-mapping"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className={[
        'm-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <ProductModal
        role="presentation"
        width="min(680px, calc(100vw - 32px))"
        maxHeight="calc(100dvh - 24px)"
        scrollable
        onClose={close}
        dialogClassName={settingsModalClassName}
      >
        <ProductModalHeader
          compact
          title={<span id={heading}>{translate('videoEditor.effectsLibrary.mapping.title')}</span>}
          onClose={close}
          disabled={props.busy}
          closeTitle={translate('common.actions.close')}
        />
        <ProductModalBody compact className="space-y-3">
          <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]">
            {translate('videoEditor.effectsLibrary.mapping.help')}
          </p>
          <ProductField label={translate('videoEditor.effectsLibrary.mapping.copyLabel')}>
            <ProductInput
              autoFocus
              value={label}
              maxLength={128}
              disabled={props.busy}
              aria-label={translate('videoEditor.effectsLibrary.mapping.copyLabel')}
              onChange={(event) => setLabel(event.target.value)}
            />
          </ProductField>
          {slots.length ? (
            <div className="divide-y divide-[var(--sniptale-color-border-soft)]">
              {slots.map((slot, index) => (
                <SlotFields
                  key={slot.id}
                  slot={slot}
                  draft={drafts[index]!}
                  busy={props.busy}
                  change={(patch) =>
                    setDrafts((current) =>
                      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft))
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <p>{translate('videoEditor.effectsLibrary.mapping.empty')}</p>
          )}
          {props.error || (selected && !prepared) ? (
            <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
              {props.error ?? translate('videoEditor.effectsLibrary.mapping.invalid')}
            </p>
          ) : null}
        </ProductModalBody>
        <ProductModalFooter compact>
          <ProductActionButton compact tone="secondary" onClick={close} disabled={props.busy}>
            {translate('common.actions.cancel')}
          </ProductActionButton>
          <ProductActionButton
            compact
            disabled={props.busy || prepared === null}
            onClick={() => {
              if (prepared) void props.onSave(prepared);
            }}
          >
            {translate(
              props.busy
                ? 'videoEditor.effectsLibrary.mapping.saving'
                : 'videoEditor.effectsLibrary.mapping.save'
            )}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}
