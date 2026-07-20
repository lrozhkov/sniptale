export function glassPanel(radius: number) {
  return {
    fill: 'token:panel',
    radius,
    shadowBlur: 28,
    shadowColor: 'rgba(0,0,0,0.22)',
    shadowY: 14,
    stroke: 'token:glassStroke',
    strokeWidth: 1,
  };
}

export function pill() {
  return { fill: 'token:accent', radius: 999 };
}

export function titleText(fontSize: number, align = 'left') {
  return {
    align,
    fill: 'token:text',
    fontFamily: '"Segoe UI", sans-serif',
    fontSize,
    lineHeight: 1.05,
    weight: 720,
  };
}

export function mutedText(fontSize: number, align = 'left') {
  return {
    align,
    fill: 'token:mutedText',
    fontFamily: '"Segoe UI", sans-serif',
    fontSize,
    lineHeight: 1.25,
    weight: 520,
  };
}
