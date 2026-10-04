import { captureDomElementState } from './dom';
import type { PageDomElementState, PageDomMutationBatch, PagePreparationDomElement } from './types';

function rebaseStyle(
  target: PagePreparationDomElement,
  before: string | undefined,
  after: string | undefined,
  current: string | undefined
): string {
  const previous = target.ownerDocument.createElement('div').style;
  const next = target.ownerDocument.createElement('div').style;
  const result = target.ownerDocument.createElement('div').style;
  previous.cssText = before ?? '';
  next.cssText = after ?? '';
  result.cssText = current ?? '';
  for (const property of new Set([...Array.from(previous), ...Array.from(next)])) {
    if (
      previous.getPropertyValue(property) === next.getPropertyValue(property) &&
      previous.getPropertyPriority(property) === next.getPropertyPriority(property)
    )
      continue;
    if (next.getPropertyValue(property)) {
      result.setProperty(
        property,
        next.getPropertyValue(property),
        next.getPropertyPriority(property)
      );
    } else {
      result.removeProperty(property);
    }
  }
  return result.cssText;
}

function rebaseElementState(
  target: PagePreparationDomElement,
  before: PageDomElementState,
  after: PageDomElementState,
  current: PageDomElementState
): PageDomElementState {
  const attributes = { ...current.attributes };
  for (const name of new Set([
    ...Object.keys(before.attributes),
    ...Object.keys(after.attributes),
  ])) {
    if (before.attributes[name] === after.attributes[name]) continue;
    const value =
      name === 'style'
        ? rebaseStyle(
            target,
            before.attributes[name],
            after.attributes[name],
            current.attributes[name]
          )
        : after.attributes[name];
    if (value === undefined || (name === 'style' && !value)) delete attributes[name];
    else attributes[name] = value;
  }
  return { attributes, html: before.html === after.html ? current.html : after.html };
}

/** Rebase changed fields; exact binding checks and sanitization remain in the DOM apply owner. */
export function rebaseDomMutationBatch(
  batch: PageDomMutationBatch | null,
  direction: 'undo' | 'redo'
): PageDomMutationBatch | null {
  if (!batch) return null;
  return {
    patches: batch.patches.map((patch) => {
      const current = captureDomElementState(patch.target);
      const previous = direction === 'undo' ? patch.after : patch.before;
      const next = direction === 'undo' ? patch.before : patch.after;
      return {
        ...patch,
        before: current,
        after: rebaseElementState(patch.target, previous, next, current),
      };
    }),
  };
}

/** Compare earliest owned field baselines with the live DOM without replaying history. */
export function hasDomMutationChanges(batches: readonly (PageDomMutationBatch | null)[]): boolean {
  const baselines = new Map<PagePreparationDomElement, Map<string, string | undefined>>();
  for (const batch of batches)
    for (const patch of batch?.patches ?? []) {
      const fields = baselines.get(patch.target) ?? new Map<string, string | undefined>();
      if (patch.before.html !== patch.after.html && !fields.has('html'))
        fields.set('html', patch.before.html);
      for (const name of new Set([
        ...Object.keys(patch.before.attributes),
        ...Object.keys(patch.after.attributes),
      ])) {
        if (
          patch.before.attributes[name] !== patch.after.attributes[name] &&
          !fields.has(`attr:${name}`)
        ) {
          fields.set(`attr:${name}`, patch.before.attributes[name]);
        }
      }
      baselines.set(patch.target, fields);
    }
  return [...baselines].some(([target, fields]) => {
    const current = captureDomElementState(target);
    return [...fields].some(
      ([field, value]) =>
        (field === 'html' ? current.html : current.attributes[field.slice(5)]) !== value
    );
  });
}
