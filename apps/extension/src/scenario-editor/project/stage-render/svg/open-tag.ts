export function buildSvgOpenTag(canvas: { height: number; width: number }) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` width="${canvas.width}" height="${canvas.height}"`,
    ` viewBox="0 0 ${canvas.width} ${canvas.height}">`,
  ].join('');
}
