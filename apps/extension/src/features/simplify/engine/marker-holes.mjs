// Reject a compact mark claim when its color is enclosed by contrasting ink and also
// appears on the surrounding field. Work on source pixels before whitening.
export function rejectMarkerHoles(image, markers) {
  const { data, width, height } = image;
  const rgb = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  return markers.filter((marker) => {
    if (marker.kind !== 'compact-disc') return true;
    const pad = Math.max(7, Math.ceil(Math.max(marker.w, marker.h) * 0.8));
    const left = Math.max(0, Math.floor(marker.x - pad)),
      top = Math.max(0, Math.floor(marker.y - pad));
    const right = Math.min(width, Math.ceil(marker.x + marker.w + pad)),
      bottom = Math.min(height, Math.ceil(marker.y + marker.h + pad));
    const cx = Math.floor(marker.x + marker.w / 2),
      cy = Math.floor(marker.y + marker.h / 2);
    if (cx < left || cx >= right || cy < top || cy >= bottom) return true;
    const color = rgb(cx, cy),
      w = right - left,
      h = bottom - top;
    let boundary = 0,
      matching = 0;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++)
        if (x === left || x === right - 1 || y === top || y === bottom - 1) {
          boundary++;
          if (distance(rgb(x, y), color) <= 35) matching++;
        }
    if (matching / boundary < 0.35) return true;
    const seen = new Uint8Array(w * h),
      queue = [(cy - top) * w + cx - left];
    seen[queue[0]] = 1;
    for (let n = 0; n < queue.length; n++) {
      const p = queue[n],
        x = p % w,
        y = Math.floor(p / w);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return true;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          k = yy * w + xx;
        if (
          xx < 0 ||
          yy < 0 ||
          xx >= w ||
          yy >= h ||
          seen[k] ||
          distance(rgb(left + xx, top + yy), color) > 35
        )
          continue;
        seen[k] = 1;
        queue.push(k);
      }
    }
    return false;
  });
}
