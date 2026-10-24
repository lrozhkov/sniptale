import { parse } from 'postcss';

/** Keep Tailwind's generated property defaults active inside the reference ShadowRoot. */
export function enableShadowPropertyDefaults(css: string): string {
  const root = parse(css);
  let unwrapped = 0;
  root.walkAtRules('layer', (layer) => {
    if (layer.params.trim() !== 'properties') return;
    layer.each((child) => {
      if (child.type !== 'atrule' || child.name !== 'supports' || !child.nodes?.length) return;
      // Chromium ignores @property registrations in ShadowRoot. Its normal browser
      // fallback condition is false there, so retain those same generated defaults.
      child.replaceWith(...child.nodes);
      unwrapped += 1;
    });
  });
  if (unwrapped === 0) {
    throw new Error('Picker CSS must include Tailwind property fallbacks for Shadow DOM.');
  }
  return root.toString();
}
