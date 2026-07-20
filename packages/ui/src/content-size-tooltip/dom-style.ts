type StyleTarget = HTMLElement | SVGElement;
export type ContentSizeTooltipStyleRecord = Record<string, string | number>;

function toCssPropertyName(property: string) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function applyTooltipDomStyle(target: StyleTarget, style: ContentSizeTooltipStyleRecord) {
  Object.entries(style).forEach(([property, value]) => {
    (target as HTMLElement).style.setProperty(toCssPropertyName(property), String(value));
  });
}
