const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const key = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
export function sampleBackground(image, box) {
  const { data, width, height } = image,
    edges = [[], [], [], []];
  const add = (edge, x, y) => {
    x = clamp(Math.round(x), 0, width - 1);
    y = clamp(Math.round(y), 0, height - 1);
    const i = (y * width + x) * 4;
    if (data[i + 3] >= 128) edge.push([data[i], data[i + 1], data[i + 2]]);
  };
  for (let x = box.x - 2; x <= box.x + box.w + 2; x += 2) {
    add(edges[0], x, box.y - 2);
    add(edges[1], x, box.y + box.h + 2);
  }
  for (let y = box.y; y <= box.y + box.h; y += 2) {
    add(edges[2], box.x - 2, y);
    add(edges[3], box.x + box.w + 2, y);
  }
  const bins = new Map();
  for (const edge of edges)
    for (const rgb of edge) {
      const weight = 1 / edge.length,
        k = key(...rgb),
        bin = bins.get(k) || [0, 0, 0, 0];
      bin[0] += weight;
      rgb.forEach((v, c) => (bin[c + 1] += v * weight));
      bins.set(k, bin);
    }
  const best = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  return best ? best.slice(1).map((v) => Math.round(v / best[0])) : [255, 255, 255];
}
