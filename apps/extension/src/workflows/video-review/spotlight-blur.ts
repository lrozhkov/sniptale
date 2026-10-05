/** Replicate edge pixels before filtering so source-over never reveals the sharp scene at edges. */
export function drawReviewBlurredScene(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  radius: number
) {
  // Chromium's Gaussian support extends to roughly three standard deviations.
  const pad = Math.ceil(radius * 3) + 2;
  const width = source.width + pad * 2;
  const height = source.height + pad * 2;
  if (scratch.width !== width) scratch.width = width;
  if (scratch.height !== height) scratch.height = height;
  const copy = scratch.getContext('2d');
  if (!copy) throw new Error('Spotlight compositor is unavailable.');
  copy.clearRect(0, 0, width, height);
  const columns = [
    { source: 0, size: 1, target: 0, span: pad },
    { source: 0, size: source.width, target: pad, span: source.width },
    { source: source.width - 1, size: 1, target: pad + source.width, span: pad },
  ];
  const rows = [
    { source: 0, size: 1, target: 0, span: pad },
    { source: 0, size: source.height, target: pad, span: source.height },
    { source: source.height - 1, size: 1, target: pad + source.height, span: pad },
  ];
  for (const row of rows)
    for (const column of columns)
      copy.drawImage(
        source,
        column.source,
        row.source,
        column.size,
        row.size,
        column.target,
        row.target,
        column.span,
        row.span
      );
  context.filter = `blur(${radius}px)`;
  context.drawImage(scratch, -pad, -pad);
  context.filter = 'none';
}
