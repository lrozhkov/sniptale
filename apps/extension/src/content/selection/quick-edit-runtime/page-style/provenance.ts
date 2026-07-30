import type {
  CssDeclarationDelta,
  CssDeclarationPolicy,
  CssDeclarationValue,
  PageStyleMutationBatch,
  PageStyleMutationElement,
} from './types';

const declarationPolicies = new WeakMap<
  PageStyleMutationElement,
  Map<CssDeclarationDelta['property'], { policy: CssDeclarationPolicy; value: CssDeclarationValue }>
>();
const declarationPolicyDocuments = new WeakMap<
  Document,
  { dirtyTargets: WeakSet<Element>; observer: MutationObserver }
>();

interface OwnerDeclarationMutationToken {
  beforeStyle: string | null;
  target: PageStyleMutationElement;
}

function declarationValuesEqual(left: CssDeclarationValue, right: CssDeclarationValue): boolean {
  return left.priority === right.priority && left.value === right.value;
}

export function cloneDeclarationPolicy(policy: CssDeclarationPolicy): CssDeclarationPolicy {
  return {
    ...(policy.assetUrl ? { assetUrl: policy.assetUrl } : {}),
    source: policy.source,
  };
}

function markPageStylePolicyRecords(
  dirtyTargets: WeakSet<Element>,
  records: MutationRecord[],
  ownerTarget?: PageStyleMutationElement
): void {
  records.forEach((record) => {
    const belongsToOwner = ownerTarget?.isSameNode(record.target) === true;
    if (!belongsToOwner && record.target.nodeType === Node.ELEMENT_NODE) {
      dirtyTargets.add(record.target as Element);
    }
  });
}

function ensureDeclarationPolicyDocument(target: PageStyleMutationElement): {
  dirtyTargets: WeakSet<Element>;
  observer: MutationObserver;
} {
  const ownerDocument = target.ownerDocument;
  const existing = declarationPolicyDocuments.get(ownerDocument);
  if (existing) {
    return existing;
  }

  const dirtyTargets = new WeakSet<Element>();
  const MutationObserverConstructor =
    ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new MutationObserverConstructor((records) => {
    markPageStylePolicyRecords(dirtyTargets, records);
  });
  observer.observe(ownerDocument.documentElement, {
    attributeFilter: ['style'],
    attributeOldValue: true,
    attributes: true,
    subtree: true,
  });
  const state = { dirtyTargets, observer };
  declarationPolicyDocuments.set(ownerDocument, state);
  return state;
}

export function invalidatePageOwnedDeclarationPolicies(target: PageStyleMutationElement): void {
  const state = ensureDeclarationPolicyDocument(target);
  markPageStylePolicyRecords(state.dirtyTargets, state.observer.takeRecords());
  if (state.dirtyTargets.has(target)) {
    declarationPolicies.delete(target);
    state.dirtyTargets.delete(target);
  }
}

export function beginOwnerDeclarationMutation(
  target: PageStyleMutationElement
): OwnerDeclarationMutationToken {
  invalidatePageOwnedDeclarationPolicies(target);
  return { beforeStyle: target.getAttribute('style'), target };
}

export function completeOwnerDeclarationMutation(token: OwnerDeclarationMutationToken): boolean {
  const state = ensureDeclarationPolicyDocument(token.target);
  const records = state.observer.takeRecords();
  const ownerRecords = records.filter(
    (record) => token.target.isSameNode(record.target) && record.attributeName === 'style'
  );
  markPageStylePolicyRecords(state.dirtyTargets, records, token.target);
  const exactTransition =
    ownerRecords.length === 1 && ownerRecords[0]?.oldValue === token.beforeStyle;
  if (!exactTransition) {
    declarationPolicies.delete(token.target);
  }
  state.dirtyTargets.delete(token.target);
  return exactTransition;
}

export function readDeclarationPolicy(
  target: PageStyleMutationElement,
  property: CssDeclarationDelta['property'],
  value: CssDeclarationValue
): CssDeclarationPolicy {
  const retained = declarationPolicies.get(target)?.get(property);
  return retained && declarationValuesEqual(retained.value, value)
    ? cloneDeclarationPolicy(retained.policy)
    : { source: 'inspector' };
}

export function isCurrentDeclarationPolicy(args: {
  expected: CssDeclarationPolicy;
  property: CssDeclarationDelta['property'];
  target: PageStyleMutationElement;
  value: CssDeclarationValue;
}): boolean {
  const current = readDeclarationPolicy(args.target, args.property, args.value);
  return current.source === args.expected.source && current.assetUrl === args.expected.assetUrl;
}

export function rememberDeclarationPolicies(
  batch: PageStyleMutationBatch,
  side: 'after' | 'before'
): void {
  let retained = declarationPolicies.get(batch.target);
  if (!retained) {
    retained = new Map();
    declarationPolicies.set(batch.target, retained);
  }
  batch.declarations.forEach((delta) => {
    retained!.set(delta.property, {
      policy: cloneDeclarationPolicy(side === 'before' ? delta.beforePolicy : delta.afterPolicy),
      value: { ...delta[side] },
    });
  });
}
