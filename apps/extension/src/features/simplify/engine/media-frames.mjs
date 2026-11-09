// Light panels need a contrasting surround and a connected dark object.
// Clipped frames need both sides to continue to the raster edge.
const CARDINAL_LEFT = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function detectLightProductSurfaces(image, queue) {
  const { data, width: w, height: h } = image,
    step = 2,
    cw = Math.ceil(w / step),
    ch = Math.ceil(h / step),
    size = cw * ch;
  const light = new Uint8Array(size),
    out = [];
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = (y * step * w + x * step) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) >= 244) light[y * cw + x] = 1;
    }
  for (let k = light.indexOf(1); k !== -1; k = light.indexOf(1, k + 1)) {
    const { tail, l, r, t, b } = traceLightPanel(light, cw, ch, k, queue);
    const x = l * step,
      y = t * step,
      bw = Math.min(w, (r + 1) * step) - x,
      bh = Math.min(h, (b + 1) * step) - y;
    if (
      bw < 80 ||
      bh < 80 ||
      bw > 500 ||
      bh > 500 ||
      bw / bh > 3 ||
      bh / bw > 3 ||
      tail / ((r - l + 1) * (b - t + 1)) < 0.25
    )
      continue;
    // Reject document backgrounds and UI panels; the perimeter must contrast.
    const outer = samplePanelSurround(image, { x, y, w: bw, h: bh });
    if (!outer) continue;
    const object = containsDarkProduct(image, { l, r, t, b }, step, queue);
    if (object) {
      const bg = [0, 1, 2].map((c) => {
        const a = outer.map((v) => v[c]).sort((a, b) => a - b);
        return a[Math.floor(a.length / 2)];
      });
      out.push({
        x,
        y,
        w: bw,
        h: bh,
        shape: 'image',
        bg,
        contrast: 255,
        kind: 'light-product-surface',
      });
    }
  }
  return out;
}

export function detectClippedFramedImages(image) {
  const { data, width, height } = image;
  const proposals = [];
  for (let y = 1; y < height - 60; y++) {
    const visibleHeight = height - y;
    if (visibleHeight > height * 0.8) continue;
    let start = -1,
      last = -1;
    for (let x = 0; x < width; x++) {
      const a = ((y - 1) * width + x) * 4,
        b = (y * width + x) * 4;
      const difference = Math.max(...[0, 1, 2].map((c) => Math.abs(data[a + c] - data[b + c])));
      if (difference > 8) {
        if (start < 0) start = x;
        last = x;
      }
      if (start < 0 || (x - last <= 2 && x !== width - 1)) continue;
      const left = start,
        right = last + 1,
        boxWidth = right - left;
      start = -1;
      if (
        boxWidth < 80 ||
        boxWidth > 600 ||
        boxWidth / visibleHeight > 3.5 ||
        visibleHeight / boxWidth > 3
      )
        continue;
      if (Math.min(frameSideSupport(image, y, left), frameSideSupport(image, y, right - 1)) < 0.85)
        continue;
      if (!hasClippedFrameTexture(image, y, left, right, visibleHeight)) continue;
      if (hasRepeatedFrameTextBands(image, y, left, right, boxWidth)) continue;
      const samples = [];
      for (let yy = y + 4; yy < height; yy += 4)
        for (const xx of [left - 3, right + 2]) {
          if (xx < 0 || xx >= width) continue;
          const i = (yy * width + xx) * 4;
          samples.push([data[i], data[i + 1], data[i + 2]]);
        }
      const bg = [0, 1, 2].map((c) => {
        const values = samples.map((s) => s[c]).sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)] ?? 255;
      });
      proposals.push({
        x: left,
        y,
        w: boxWidth,
        h: visibleHeight,
        shape: 'image',
        bg,
        contrast: 255,
        kind: 'clipped-framed-image',
      });
    }
  }
  proposals.sort((a, b) => b.w * b.h - a.w * a.h);
  return proposals.filter(
    (p, i) =>
      !proposals.slice(0, i).some((q) => {
        const iw = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
        const ih = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
        return iw * ih > p.w * p.h * 0.8;
      })
  );
}

function traceLightPanel(light, cw, ch, seed, queue) {
  let head = 0,
    tail = 1,
    l = cw,
    r = 0,
    t = ch,
    b = 0;
  queue[0] = seed;
  light[seed] = 2;
  while (head < tail) {
    const p = queue[head++],
      x = p % cw,
      y = Math.floor(p / cw);
    l = Math.min(l, x);
    r = Math.max(r, x);
    t = Math.min(t, y);
    b = Math.max(b, y);
    for (const [dx, dy] of CARDINAL_LEFT) {
      const xx = x + dx,
        yy = y + dy,
        z = yy * cw + xx;
      if (xx >= 0 && xx < cw && yy >= 0 && yy < ch && light[z] === 1) {
        light[z] = 2;
        queue[tail++] = z;
      }
    }
  }
  return { tail, l, r, t, b };
}

function containsDarkProduct(image, panel, step, queue) {
  const { data, width: w } = image;
  const { l, r, t, b } = panel;
  const seen = new Uint8Array((r - l + 1) * (b - t + 1)),
    ww = r - l + 1,
    hh = b - t + 1;
  let object = false;
  for (let py = 0; py < hh && !object; py++)
    for (let px = 0; px < ww && !object; px++) {
      const id = py * ww + px,
        gi = ((t + py) * step * w + (l + px) * step) * 4;
      if (seen[id] || Math.max(data[gi], data[gi + 1], data[gi + 2]) > 205) continue;
      const { qt, ol, or, ot, ob } = traceDarkProduct(
        image,
        { l, t, ww, hh, step },
        seen,
        id,
        queue
      );
      const ow = or - ol + 1,
        oh = ob - ot + 1;
      if (ow >= 25 && oh >= 25 && qt / (ow * oh) > 0.22 && qt > ww * hh * 0.035) object = true;
    }
  return object;
}

function traceDarkProduct(image, panel, seen, seed, queue) {
  const { data, width: w } = image;
  const { l, t, ww, hh, step } = panel;
  let qh = 0,
    qt = 1,
    ol = ww,
    or = 0,
    ot = hh,
    ob = 0;
  queue[0] = seed;
  seen[seed] = 1;
  while (qh < qt) {
    const z = queue[qh++],
      zx = z % ww,
      zy = Math.floor(z / ww);
    ol = Math.min(ol, zx);
    or = Math.max(or, zx);
    ot = Math.min(ot, zy);
    ob = Math.max(ob, zy);
    for (const [dx, dy] of CARDINAL_LEFT) {
      const nx = zx + dx,
        ny = zy + dy,
        n = ny * ww + nx;
      if (nx < 0 || nx >= ww || ny < 0 || ny >= hh || seen[n]) continue;
      const j = ((t + ny) * step * w + (l + nx) * step) * 4;
      if (Math.max(data[j], data[j + 1], data[j + 2]) <= 205) {
        seen[n] = 1;
        queue[qt++] = n;
      }
    }
  }
  return { qt, ol, or, ot, ob };
}

function samplePanelSurround(image, box) {
  const { data, width: w } = image;
  const { x, y, w: bw, h: bh } = box;
  let boundary = 0,
    samples = 0,
    outer = [];
  for (let yy = y + 4; yy < y + bh; yy += 4)
    for (const xx of [x - 3, x + bw + 2]) {
      if (xx < 0 || xx >= w) continue;
      const i = (yy * w + xx) * 4;
      samples++;
      outer.push([data[i], data[i + 1], data[i + 2]]);
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 225) boundary++;
    }
  if (samples < 10 || boundary / samples < 0.55) return null;
  return outer;
}

function frameSideSupport(image, y, edge) {
  const { data, width, height } = image;

  let hits = 0,
    count = 0;
  for (let yy = y + 4; yy < height; yy += 2) {
    let lo = 255,
      hi = 0;
    for (let xx = Math.max(0, edge - 2); xx <= Math.min(width - 1, edge + 2); xx++) {
      const i = (yy * width + xx) * 4,
        value = (data[i] + data[i + 1] + data[i + 2]) / 3;
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
    count++;
    if (hi - lo > 7) hits++;
  }
  return hits / Math.max(1, count);
}

function hasClippedFrameTexture(image, y, left, right, visibleHeight) {
  const { data, width, height } = image;
  const bins = new Set();
  let dark = 0,
    color = 0,
    count = 0,
    bottomDark = 0,
    bottomCount = 0;
  for (let yy = y + 4; yy < height; yy += 2)
    for (let xx = left + 4; xx < right - 4; xx += 2) {
      const i = (yy * width + xx) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      bins.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (Math.min(r, g, b) < 225) dark++;
      if (yy >= y + visibleHeight / 2) {
        bottomCount++;
        if (Math.min(r, g, b) < 225) bottomDark++;
      }
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) color++;
      count++;
    }
  if (
    bins.size < 30 ||
    dark / count < 0.32 ||
    bottomDark / bottomCount < 0.1 ||
    (color / count < 0.09 && dark / count < 0.8)
  )
    return false;
  return true;
}

function hasRepeatedFrameTextBands(image, y, left, right, boxWidth) {
  const { data, width, height } = image;
  const bands = [];
  let bandStart = -1;
  for (let yy = y; yy < height; yy++) {
    let edges = 0;
    for (let xx = left; xx < right - 1; xx++) {
      const i = (yy * width + xx) * 4;
      if (
        Math.abs(data[i] - data[i + 4]) +
          Math.abs(data[i + 1] - data[i + 5]) +
          Math.abs(data[i + 2] - data[i + 6]) >
        45
      )
        edges++;
    }
    if (edges > Math.max(3, boxWidth * 0.012)) {
      if (bandStart < 0) bandStart = yy;
    } else if (bandStart >= 0) {
      bands.push(yy - bandStart);
      bandStart = -1;
    }
  }
  if (bandStart >= 0) bands.push(height - bandStart);
  const sortedBands = [...bands].sort((a, b) => a - b),
    median = sortedBands[Math.floor(sortedBands.length / 2)];
  if (
    bands.length >= 3 &&
    median >= 8 &&
    median <= 22 &&
    bands.filter((v) => Math.abs(v - median) <= 3).length / bands.length >= 0.7
  )
    return true;
  return false;
}
