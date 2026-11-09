const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
/** Assign already detected text decorations without expanding glyph geometry. */
export function attachTextDecorations(image, boxes, decorations, protectedRects = []) {
  const overlap = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  return boxes.map((box) => {
    if (box.shape !== 'text' || !box.textConfidence) return box;
    const candidates = decorations.filter(
      (d) =>
        d.y >= box.y + box.h - 4 &&
        d.y <= box.y + box.h + 3 &&
        d.x >= box.x - 2 &&
        d.x + d.w <= box.x + box.w + 2 &&
        !protectedRects.some((p) => overlap(p, d))
    );
    if (!candidates.length) return box;
    const colors = [];
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = (y * image.width + x) * 4;
        if (
          Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c]))) >=
          Math.max(40, (box.contrast || 100) * 0.8)
        )
          colors.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
      }
    if (colors.length < 8) return box;
    const color = [0, 1, 2].map((c) => median(colors.map((p) => p[c])));
    const owned = candidates.filter((d) => {
      const colors = [];
      for (let y = d.y; y < d.y + d.h; y++)
        for (let x = d.x; x < d.x + d.w; x++) {
          const i = (y * image.width + x) * 4;
          colors.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
        }
      return Math.max(...color.map((v, c) => Math.abs(v - median(colors.map((p) => p[c]))))) <= 48;
    });
    if (!owned.length) return box;
    const original = { ...box };
    delete original.eraseFragments;
    return {
      ...box,
      textDecorations: owned,
      eraseFragments: [
        ...(box.eraseFragments || [original]),
        ...owned
          .filter(
            (d) =>
              !(
                d.x >= box.x &&
                d.y >= box.y &&
                d.x + d.w <= box.x + box.w &&
                d.y + d.h <= box.y + box.h
              )
          )
          .map((d) => ({ ...d, bg: box.bg, shape: 'text' })),
      ],
    };
  });
}
