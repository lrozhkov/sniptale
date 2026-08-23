const RETIRED_IDENTITY_ROOTS = [
  ['scr', 'een', 'yx'].join(''),
  ['smart', 'capture'].join(''),
  ['ns', 'mp'].join(''),
  ['s', 'cx'].join(''),
];
const RETIRED_EFFECT_ROOT = ['eff', 'ect'].join('');
const RETIRED_EFFECT_VERSION = ['v', '4'].join('');
const RETIRED_EFFECT_SEPARATORS = new Set(['-', '.', '_', ' ']);

function isAsciiIdentityCharacter(value) {
  const code = value?.charCodeAt(0) ?? 0;
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function containsRetiredProductIdentity(folded, root) {
  if (root.length > 4) return folded.includes(root);
  let offset = 0;
  while (offset < folded.length) {
    const rootIndex = folded.indexOf(root, offset);
    if (rootIndex < 0) return false;
    const before = folded[rootIndex - 1];
    const after = folded[rootIndex + root.length];
    if (!isAsciiIdentityCharacter(before) && !isAsciiIdentityCharacter(after)) return true;
    offset = rootIndex + 1;
  }
  return false;
}

function containsRetiredEffectIdentity(folded) {
  let offset = 0;
  while (offset < folded.length) {
    const rootIndex = folded.indexOf(RETIRED_EFFECT_ROOT, offset);
    if (rootIndex < 0) return false;
    const versionOffset = rootIndex + RETIRED_EFFECT_ROOT.length;
    const nextOffset = RETIRED_EFFECT_SEPARATORS.has(folded[versionOffset] ?? '')
      ? versionOffset + 1
      : versionOffset;
    if (folded.startsWith(RETIRED_EFFECT_VERSION, nextOffset)) return true;
    offset = rootIndex + 1;
  }
  return false;
}

export function retiredIdentityKind(value) {
  const folded = value.toLocaleLowerCase('en-US');
  const productIndex = RETIRED_IDENTITY_ROOTS.findIndex((root) =>
    containsRetiredProductIdentity(folded, root)
  );
  if (productIndex >= 0) return `retired product root ${productIndex + 1}`;
  return containsRetiredEffectIdentity(folded) ? 'retired Effect public version' : null;
}
