import {
  listAnimationTemplateSlots,
  validateAnimationTemplate,
  type AnimationTemplate,
  type AnimationTemplateSlot,
  type AnimationSlotBinding,
} from '@sniptale/runtime-contracts/animation-template';
import type { ControlDefinition } from '@sniptale/runtime-contracts/effect-controls';

export type SlotMappingUnit =
  | 'identity'
  | 'percent-to-ratio'
  | 'degrees-to-radians'
  | 'normalized-to-pixels';
export interface SlotMappingDraft {
  slotId: string;
  enabled: boolean;
  label: string;
  minimum: string;
  maximum: string;
  unit: SlotMappingUnit;
}
export function createSlotMappingDrafts(template: AnimationTemplate): SlotMappingDraft[] {
  const slots = listAnimationTemplateSlots(template);
  if (slots.length > 256) throw new Error('ANIMATION_MAPPING_SLOT_LIMIT');
  return slots.map((slot) => {
    const numeric =
      typeof slot.value === 'number'
        ? [slot.value]
        : typeof slot.value === 'object' && slot.value !== null
          ? slot.value
          : [0];
    return {
      slotId: slot.id,
      enabled: false,
      label: slot.id,
      minimum: String(Math.min(0, ...numeric)),
      maximum: String(Math.max(100, ...numeric)),
      unit: 'identity',
    };
  });
}
function numericBounds(draft: SlotMappingDraft, value: number) {
  if (!draft.minimum.trim() || !draft.maximum.trim()) throw new Error('ANIMATION_MAPPING_RANGE');
  const min = Number(draft.minimum),
    max = Number(draft.maximum);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || value < min || value > max)
    throw new Error('ANIMATION_MAPPING_RANGE');
  return { min, max };
}
function slotValues(slot: AnimationTemplateSlot): number[] {
  if (typeof slot.value === 'number') return [slot.value];
  if (typeof slot.value === 'object' && slot.value !== null) return [...slot.value];
  throw new Error('ANIMATION_MAPPING_VALUE');
}
/** Create a separate source. Existing controls, layouts, presets and animation keys remain intact. */
export function prepareSlotMappedAnimation(args: {
  template: AnimationTemplate;
  drafts: readonly SlotMappingDraft[];
  id: string;
  label: string;
}): AnimationTemplate {
  const slots = new Map(listAnimationTemplateSlots(args.template).map((slot) => [slot.id, slot]));
  const controls: ControlDefinition[] = [...structuredClone(args.template.controls)];
  const bindings: AnimationSlotBinding[] = structuredClone(args.template.bindings);
  const seen = new Set<string>();
  let selected = 0;
  for (const draft of args.drafts) {
    if (seen.has(draft.slotId)) throw new Error('ANIMATION_MAPPING_DUPLICATE');
    seen.add(draft.slotId);
    if (!draft.enabled) continue;
    selected++;
    const slot = slots.get(draft.slotId);
    if (!slot || slot.unavailable || !slot.kind) throw new Error('ANIMATION_MAPPING_SLOT');
    const label = draft.label.trim();
    if (!label || label.length > 128) throw new Error('ANIMATION_MAPPING_LABEL');
    let ordinal = 0;
    while (
      controls.some((control) =>
        [`mapped-${ordinal}`, `mapped-${ordinal}-x`, `mapped-${ordinal}-y`].includes(control.id)
      )
    )
      ordinal++;
    const baseId = `mapped-${ordinal}`;
    if (slot.kind === 'text' || slot.kind === 'color') {
      if (draft.unit !== 'identity') throw new Error('ANIMATION_MAPPING_UNIT');
      let value: string;
      if (slot.kind === 'text' && typeof slot.value === 'string') value = slot.value;
      else if (slot.kind === 'color') {
        const parts = slotValues(slot);
        value =
          '#' +
          [...parts.slice(0, 3), parts[3] ?? 1]
            .map((part) =>
              Math.round(part * 255)
                .toString(16)
                .padStart(2, '0')
            )
            .join('');
      } else throw new Error('ANIMATION_MAPPING_VALUE');
      controls.push({
        id: baseId,
        kind: slot.kind,
        defaultValue: value,
        label: { en: label, ru: label },
        group: slot.kind === 'text' ? 'content' : 'appearance',
      });
      bindings.push({ kind: slot.kind, slot: slot.id, control: baseId });
      continue;
    }
    const raw = slotValues(slot);
    if (slot.kind === 'scalar') {
      if (draft.unit === 'normalized-to-pixels') throw new Error('ANIMATION_MAPPING_UNIT');
      const value =
        raw[0]! *
        (draft.unit === 'percent-to-ratio'
          ? 100
          : draft.unit === 'degrees-to-radians'
            ? 180 / Math.PI
            : 1);
      controls.push({
        id: baseId,
        kind: 'number',
        defaultValue: value,
        ...numericBounds(draft, value),
        label: { en: label, ru: label },
        group: 'appearance',
        presentation: 'number',
      });
      bindings.push({ kind: 'scalar', slot: slot.id, control: baseId, unit: draft.unit });
    } else {
      if (draft.unit !== 'identity' && draft.unit !== 'normalized-to-pixels')
        throw new Error('ANIMATION_MAPPING_UNIT');
      const dimensions = [args.template.animation['w'], args.template.animation['h']];
      for (const [index, axis] of ['x', 'y'].entries()) {
        const dimension = dimensions[index];
        if (typeof dimension !== 'number' || dimension <= 0)
          throw new Error('ANIMATION_MAPPING_VALUE');
        const value = raw[index]! / (draft.unit === 'normalized-to-pixels' ? dimension : 1);
        controls.push({
          id: `${baseId}-${axis}`,
          kind: 'number',
          defaultValue: value,
          ...numericBounds(draft, value),
          label: { en: `${label} ${axis.toUpperCase()}`, ru: `${label} ${axis.toUpperCase()}` },
          group: 'geometry',
          presentation: 'number',
        });
      }
      bindings.push({
        kind: 'vector',
        slot: slot.id,
        xControl: `${baseId}-x`,
        yControl: `${baseId}-y`,
        unit: draft.unit,
      });
    }
  }
  if (!selected || !args.label.trim() || args.id === args.template.id)
    throw new Error('ANIMATION_MAPPING_EMPTY');
  const candidate = {
    ...structuredClone(args.template),
    id: args.id,
    label: { en: args.label.trim(), ru: args.label.trim() },
    controls,
    bindings,
  };
  const result = validateAnimationTemplate(candidate);
  if (!result.ok) throw new Error('ANIMATION_MAPPING_INVALID');
  return result.template;
}
