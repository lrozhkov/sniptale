function contourInk(image, bg, x, y) {
  const i = (y * image.width + x) * 4;
  return Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40;
}

// Four similar, separated, rectangular marks must form both rows and columns.
export function grid(image, parts, bg) {
  if (parts.length !== 4) return false;
  const sorted = [...parts].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows = [
    sorted.slice(0, 2).sort((a, b) => a.x - b.x),
    sorted.slice(2).sort((a, b) => a.x - b.x),
  ];
  const [a, b, c, d] = rows.flat(),
    side = parts.reduce((s, p) => s + (p.w + p.h) / 2, 0) / 4;
  const tol = Math.max(1, side * 0.24);
  if (
    side < 3 ||
    parts.some(
      (p) => p.w < 3 || p.h < 3 || Math.abs(p.w - side) > tol || Math.abs(p.h - side) > tol
    )
  )
    return false;
  if (
    Math.abs(a.y - b.y) > tol ||
    Math.abs(c.y - d.y) > tol ||
    Math.abs(a.x - c.x) > tol ||
    Math.abs(b.x - d.x) > tol
  )
    return false;
  const gaps = [b.x - a.x - a.w, d.x - c.x - c.w, c.y - a.y - a.h, d.y - b.y - b.h];
  if (
    gaps.some((g) => g < 1 || g > side * 1.2) ||
    Math.max(...gaps) - Math.min(...gaps) > Math.max(2, side * 0.5)
  )
    return false;
  const pixel = (p, x, y) => {
    const i = ((p.y + y) * image.width + p.x + x) * 4;
    return Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40;
  };
  const density = parts.map((p) => p.n / (p.w * p.h));
  if (Math.min(...density) >= 0.85) return 'solid-grid';

  if (
    parts.filter((p) => gridPlus(p, pixel)).length === 1 &&
    parts.filter((p) => gridFrame(p, pixel)).length === 3
  )
    return 'frame-plus-grid';
  // Four corner arrows have matching masks under horizontal and vertical reflection,
  // with ink at each inward-facing tip. This excludes closed letter contours.
  if (parts.some((p) => p.w !== a.w || p.h !== a.h)) return false;
  let mismatch = 0,
    total = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      const values = [
        pixel(a, x, y),
        pixel(b, a.w - 1 - x, y),
        pixel(c, x, a.h - 1 - y),
        pixel(d, a.w - 1 - x, a.h - 1 - y),
      ];
      total += 3;
      mismatch += values.slice(1).filter((v) => v !== values[0]).length;
    }
  const tip =
    pixel(a, a.w - 1, a.h - 1) && pixel(b, 0, b.h - 1) && pixel(c, c.w - 1, 0) && pixel(d, 0, 0);
  const outerTop =
    Array.from({ length: a.w }, (_, x) => pixel(a, x, 0)).filter(Boolean).length / a.w;
  const outerLeft =
    Array.from({ length: a.h }, (_, y) => pixel(a, 0, y)).filter(Boolean).length / a.h;
  return tip && outerTop >= 0.7 && outerLeft >= 0.6 && mismatch / total <= 0.12
    ? 'outward-arrows'
    : false;
}

export function arrowBracket(image, parts, bg) {
  if (parts.length !== 2) return false;
  for (const bracket of parts) {
    const arrow = parts.find((p) => p !== bracket);
    if (
      bracket.h < 10 ||
      bracket.w < 4 ||
      bracket.w > bracket.h * 0.65 ||
      arrow.w < 8 ||
      arrow.h < 6 ||
      bracket.h < arrow.h * 1.25 ||
      bracket.h > arrow.h * 2.2
    )
      continue;
    if (
      arrow.x >= bracket.x ||
      arrow.x + arrow.w < bracket.x ||
      Math.abs(arrow.y + arrow.h / 2 - bracket.y - bracket.h / 2) > bracket.h * 0.16
    )
      continue;
    const row = (y) =>
      Array.from({ length: bracket.w }, (_, x) =>
        contourInk(image, bg, bracket.x + x, bracket.y + y)
      ).filter(Boolean).length;
    const col = (x) =>
      Array.from({ length: bracket.h }, (_, y) =>
        contourInk(image, bg, bracket.x + x, bracket.y + y)
      ).filter(Boolean).length;
    const edge = Math.max(col(bracket.w - 1), col(bracket.w - 2));
    if (
      Math.max(row(0), row(1)) < bracket.w * 0.7 ||
      Math.max(row(bracket.h - 1), row(bracket.h - 2)) < bracket.w * 0.7 ||
      edge < bracket.h * 0.7
    )
      continue;
    const columns = [];
    for (let x = 0; x < arrow.w; x++) {
      const ys = [];
      for (let y = 0; y < arrow.h; y++)
        if (contourInk(image, bg, arrow.x + x, arrow.y + y)) ys.push(y);
      if (!ys.length) {
        columns.length = 0;
        break;
      }
      columns.push({ span: ys.at(-1) - ys[0] + 1, center: (ys[0] + ys.at(-1)) / 2 });
    }
    if (!columns.length) continue;
    const peak = Math.max(...columns.map((c) => c.span)),
      at = columns.findIndex((c) => c.span === peak),
      centers = columns.map((c) => c.center);
    if (
      peak < arrow.h * 0.7 ||
      at < arrow.w * 0.35 ||
      at > arrow.w * 0.8 ||
      Math.max(...centers) - Math.min(...centers) > Math.max(1.5, arrow.h * 0.18)
    )
      continue;
    const stem = columns.slice(0, Math.max(2, Math.floor(arrow.w * 0.35)));
    if (stem.some((c) => c.span > Math.max(3, peak * 0.4)) || columns.at(-1).span > peak * 0.5)
      continue;
    if (columns.slice(at + 1).some((c, i) => c.span > columns[at + i].span + 2)) continue;
    return true;
  }
  return false;
}

export function stackedArrows(image, parts, bg) {
  if (parts.length !== 2) return false;
  const sorted = [...parts].sort((a, b) => a.y - b.y),
    [upper, lower] = sorted;
  if (
    upper.w < 8 ||
    upper.h < 7 ||
    lower.w < 8 ||
    lower.h < 4 ||
    upper.w > 28 ||
    lower.w > 28 ||
    lower.y < upper.y + upper.h - 2 ||
    lower.y > upper.y + upper.h + 2
  )
    return false;
  const arrows = (p) => {
    const result = [];
    for (let y = p.y + 1; y < p.y + p.h - 2; y++)
      for (let x = p.x; x < p.x + p.w;) {
        if (!contourInk(image, bg, x, y)) {
          x++;
          continue;
        }
        const start = x;
        while (x < p.x + p.w && contourInk(image, bg, x, y)) x++;
        const length = x - start;
        if (
          length < 5 ||
          !Array.from({ length }, (_, i) => contourInk(image, bg, start + i, y + 1)).every(Boolean)
        )
          continue;
        const headStart = start + Math.floor(length * 0.5),
          headEnd = x;
        const head = (yy) => {
          let n = 0,
            left = x;
          for (let xx = start; xx < x; xx++)
            if (contourInk(image, bg, xx, yy)) {
              n++;
              left = Math.min(left, xx);
            }
          return { n, left };
        };
        const above = head(y - 1),
          below = head(y + 2);
        if (
          !above.n ||
          !below.n ||
          above.left < headStart ||
          below.left < headStart ||
          above.n > length * 0.7 ||
          below.n > length * 0.7
        )
          continue;
        if (headEnd - Math.max(above.left, below.left) > length * 0.65) continue;
        result.push({ x: start, y, w: length });
      }
    return result;
  };
  const above = arrows(upper),
    below = arrows(lower);
  return above.some((a) =>
    below.some((b) => {
      if (
        a.w > b.w * 0.85 ||
        a.w < b.w * 0.3 ||
        Math.abs(a.x + a.w - b.x - b.w) > Math.max(2, b.w * 0.25)
      )
        return false;
      // The upper arrow must share the composition with a separate left-hand mark.
      let left = 0,
        aboveArrow = 0;
      for (let y = upper.y; y < upper.y + upper.h; y++)
        for (let x = upper.x; x < a.x - 1; x++)
          if (contourInk(image, bg, x, y)) {
            left++;
            if (y < a.y) aboveArrow++;
          }
      return left >= Math.max(5, a.w) && aboveArrow >= 2;
    })
  );
}

export function listDiagram(parts) {
  if (parts.length < 5 || parts.length > 6) return false;
  const markers = parts
    .filter(
      (p) =>
        p.w >= 4 && p.h >= 4 && p.w / p.h >= 0.7 && p.w / p.h <= 1.4 && p.n / (p.w * p.h) >= 0.45
    )
    .sort((a, b) => a.y - b.y);
  if (markers.length !== 2) return false;
  const [a, b] = markers,
    unit = (a.h + b.h) / 2,
    tolerance = Math.max(1, unit * 0.25);
  if (
    Math.abs(a.x - b.x) > tolerance ||
    Math.abs(a.w - b.w) > tolerance ||
    Math.abs(a.h - b.h) > tolerance ||
    b.y - a.y < a.h + 1 ||
    b.y - a.y > unit * 2.2
  )
    return false;
  const bars = parts.filter((p) => !markers.includes(p));
  if (
    bars.length < 3 ||
    bars.some(
      (p) =>
        p.w < unit * 0.75 ||
        p.h > unit * 0.4 ||
        p.w / p.h < 3 ||
        p.n / (p.w * p.h) < 0.8 ||
        p.x < a.x + a.w ||
        p.x - a.x - a.w > unit * 0.65
    )
  )
    return false;
  const rows = markers.map((m) => bars.filter((p) => p.y >= m.y && p.y + p.h <= m.y + m.h));
  if (rows.some((r) => r.length < 1) || rows[0].length + rows[1].length !== bars.length)
    return false;
  if (rows.some((r) => new Set(r.map((p) => p.y)).size !== r.length)) return false;
  if (Math.max(...bars.map((p) => p.x)) - Math.min(...bars.map((p) => p.x)) > tolerance)
    return false;
  return true;
}

// A dot group is ambiguous with punctuation. Claim it only within a row
// of two independently classified icons at a consistent spacing.
// Preserve a mixed row if its source has compact, filled color texture whose
// individual object boundary cannot be separated safely from the text.
// The marks of a small closed book have two narrow, enclosed horizontal
// openings, separated by a solid body; their outside edges shear together.
export function bookContour(image, p, bg, soft = false) {
  if (p.h < 8 || p.w / p.h < 0.85 || p.w / p.h > 1.55) return false;
  let peak = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = ((p.y + y) * image.width + p.x + x) * 4;
      peak = Math.max(peak, ...bg.map((v, c) => Math.abs(v - image.data[i + c])));
    }
  const rows = [],
    threshold = soft ? Math.max(40, peak * 0.4) : 40;
  for (let y = 0; y < p.h; y++) {
    const mask = Array.from({ length: p.w }, (_, x) => {
      const i = ((p.y + y) * image.width + p.x + x) * 4;
      return Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > threshold;
    });
    const first = mask.indexOf(true),
      last = mask.lastIndexOf(true),
      count = mask.filter(Boolean).length;
    let gap = 0,
      run = 0;
    for (let x = first + 1; x < last; x++) {
      run = mask[x] ? 0 : run + 1;
      gap = Math.max(gap, run);
    }
    rows.push({ first, last, count, gap });
  }
  const holes = rows
    .map((r, i) => (r.gap >= p.w * (soft ? 0.16 : 0.25) ? i : -1))
    .filter((i) => i >= 0);
  if (holes.length < 2 || (!soft && holes.length > Math.max(2, Math.ceil(p.h * 0.3)))) return false;
  const top = holes[0],
    bottom = holes.at(-1);
  if (top > p.h * 0.35 || bottom < p.h * 0.65 || bottom - top < p.h * 0.45) return false;
  if (
    !soft &&
    holes.some((i) => i > top + Math.max(1, p.h * 0.12) && i < bottom - Math.max(1, p.h * 0.12))
  )
    return false;
  if (!soft && (rows[0].count < p.w * 0.6 || rows.at(-1).count < p.w * 0.6)) return false;
  const middle = rows.slice(top + 1, bottom);
  if (
    middle.filter((r) => r.count >= p.w * (soft ? 0.65 : 0.72)).length <
    middle.length * (soft ? 0.65 : 0.8)
  )
    return false;
  const a = rows[top],
    b = rows[bottom],
    left = b.first - a.first,
    right = b.last - a.last;
  return (
    Math.abs(left) >= 1 &&
    (soft ? left * right >= 0 : Math.abs(right) >= 1 && Math.sign(left) === Math.sign(right)) &&
    Math.abs(left - right) <= Math.max(2, p.w * 0.2)
  );
}

// Split a spatial pictogram from a separately coherent following label.
export function filledVerticalPointer(image, p, bg) {
  if (p.w < 4 || p.h < 3 || p.w / p.h < 1 || p.w / p.h > 2.2) return false;
  const rows = [];
  for (let y = 0; y < p.h; y++) {
    const xs = [];
    for (let x = 0; x < p.w; x++) {
      const i = ((p.y + y) * image.width + p.x + x) * 4;
      if (
        image.data[i + 3] >= 128 &&
        Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40
      )
        xs.push(x);
    }
    if (!xs.length) return false;
    rows.push({ left: xs[0], right: xs.at(-1), n: xs.length });
  }
  const matches = (profile) => {
    const peak = Math.max(...profile.map((r) => r.n)),
      peakAt = profile.findIndex((r) => r.n === peak);
    return (
      peak >= p.w * 0.8 &&
      peakAt <= Math.ceil(p.h * 0.4) &&
      profile.at(-1).n <= peak * 0.7 &&
      !profile.some(
        (r, i) =>
          i > peakAt && (r.left < profile[i - 1].left - 1 || r.right > profile[i - 1].right + 1)
      ) &&
      !profile.some((r) => r.n < r.right - r.left)
    );
  };
  return matches(rows) || matches([...rows].reverse());
}

function gridPlus(p, pixel) {
  let center = 0,
    outer = 0,
    centerN = 0,
    outerN = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const central =
        Math.abs(x - (p.w - 1) / 2) <= p.w * 0.18 || Math.abs(y - (p.h - 1) / 2) <= p.h * 0.18;
      if (central) {
        centerN++;
        center += pixel(p, x, y);
      } else {
        outerN++;
        outer += pixel(p, x, y);
      }
    }
  return center / centerN >= 0.7 && outer / outerN <= 0.25;
}

function gridFrame(p, pixel) {
  let edge = 0,
    edgeN = 0,
    inside = 0,
    insideN = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1) {
        edgeN++;
        edge += pixel(p, x, y);
      } else if (x >= p.w * 0.3 && x < p.w * 0.7 && y >= p.h * 0.3 && y < p.h * 0.7) {
        insideN++;
        inside += pixel(p, x, y);
      }
    }
  return edge / edgeN >= 0.65 && insideN && inside / insideN <= 0.35;
}
