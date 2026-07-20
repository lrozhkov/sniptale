export function opsPanel(radius: number) {
  return {
    fill: 'token:panel',
    radius,
    shadowBlur: 8,
    shadowColor: 'rgba(23,20,18,0.18)',
    shadowY: 5,
    stroke: 'rgba(23,20,18,0.22)',
    strokeWidth: 1,
  };
}

export function statusFill(fill: string) {
  return { fill, radius: 4 };
}

export function codeText(fontSize: number, align = 'left') {
  return {
    align,
    fill: 'token:text',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize,
    lineHeight: 1.15,
    weight: 680,
  };
}

export function metaText(fontSize: number, align = 'left') {
  return {
    align,
    fill: 'token:mutedText',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize,
    lineHeight: 1.25,
    weight: 560,
  };
}
