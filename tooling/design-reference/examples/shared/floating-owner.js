const stack = [];
export function claimFloating(owner, { exclusive = true } = {}) {
  const parent = [...stack]
    .reverse()
    .find(
      (current) =>
        current !== owner && current.kind !== 'tooltip' && current.contains(owner.trigger)
    );
  if (exclusive) {
    const keep = parent ? stack.indexOf(parent) + 1 : 0;
    for (const current of stack.slice(keep).reverse())
      if (current !== owner) current.dismiss('replace');
  }
  if (!stack.includes(owner)) stack.push(owner);
}
export function releaseFloating(owner) {
  const index = stack.indexOf(owner);
  if (index < 0) return;
  for (const child of stack.slice(index + 1).reverse()) child.dismiss('parent');
  const next = stack.indexOf(owner);
  if (next >= 0) stack.splice(next, 1);
}
function dismissOutside(target, path) {
  for (const top of [...stack].reverse()) {
    if (top.suspended || top.dismissOutside === false) break;
    const inside = path
      ? path.some((node) => node instanceof Node && top.contains(node))
      : top.contains(target);
    if (inside) break;
    top.dismiss('outside');
  }
}
document.addEventListener(
  'pointerdown',
  (event) => dismissOutside(event.target, event.composedPath()),
  true
);
document.addEventListener('focusin', (event) => {
  if (event.target !== document.body) dismissOutside(event.target);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
    const top = stack.at(-1);
    if (top && !top.suspended) {
      event.preventDefault();
      event.stopPropagation();
      top.dismiss('escape');
    }
  }
});

export function anchorVisible(anchor) {
  const rect = anchor.getBoundingClientRect();
  if (
    !anchor.isConnected ||
    !anchor.getClientRects().length ||
    rect.bottom <= 0 ||
    rect.top >= innerHeight ||
    rect.right <= 0 ||
    rect.left >= innerWidth
  )
    return false;
  for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      const bounds = parent.getBoundingClientRect();
      if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
    }
    if (parent.matches('dialog:modal')) break;
  }
  return true;
}
