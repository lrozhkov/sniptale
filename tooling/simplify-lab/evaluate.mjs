/** Version of the independent erase oracle, including pixel distances and control classifications. */
export const ORACLE_VERSION = 'simplify-erase-raster-v1';
/** Repeat-render noise is measured in RGBA bytes. Regression tolerance belongs to run comparison. */
export const DEFAULT_THRESHOLDS = Object.freeze({ repeatNoise: 0, regressionTolerance: 0 });

function invalid(message) {
  const error = new TypeError(message);
  error.classification = 'oracle-error';
  throw error;
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function assertPlane(value, count, mask) {
  if (!(value instanceof Uint8Array) || value.length !== count)
    invalid(mask ? 'Invalid binary oracle mask' : 'Invalid RGBA oracle raster');
  if (mask && value.some((byte) => byte !== 0 && byte !== 255))
    invalid('Oracle masks must be binary');
}
function rect(value, integer = false) {
  if (!record(value)) invalid('Invalid oracle rectangle');
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(Number.isFinite)) invalid('Invalid oracle rectangle');
  if (
    !Number.isFinite(x + width) ||
    !Number.isFinite(y + height) ||
    width <= 0 ||
    height <= 0 ||
    (integer && ![x, y, width, height].every(Number.isSafeInteger))
  )
    invalid('Invalid oracle rectangle');
  return { x, y, width, height };
}
function configuration(value) {
  if (value === undefined) return { ...DEFAULT_THRESHOLDS };
  if (!record(value) || Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_THRESHOLDS, key)))
    invalid('Invalid oracle thresholds');
  const result = { ...DEFAULT_THRESHOLDS, ...value };
  if (
    !Number.isFinite(result.repeatNoise) ||
    result.repeatNoise < 0 ||
    result.repeatNoise > 255 ||
    !Number.isFinite(result.regressionTolerance) ||
    result.regressionTolerance < 0
  )
    invalid('Invalid oracle thresholds');
  return result;
}
function annotations(value) {
  if (!Array.isArray(value)) invalid('Invalid oracle fragments');
  const ids = new Set();
  return value.map((fragment) => {
    if (
      !record(fragment) ||
      typeof fragment.id !== 'string' ||
      !fragment.id.trim() ||
      ids.has(fragment.id) ||
      typeof fragment.text !== 'string' ||
      !Array.isArray(fragment.tags) ||
      !fragment.tags.every((tag) => typeof tag === 'string') ||
      !Array.isArray(fragment.rects)
    )
      invalid('Invalid oracle fragment');
    ids.add(fragment.id);
    return {
      id: fragment.id,
      text: fragment.text,
      tags: [...fragment.tags],
      rects: fragment.rects.map((value) => rect(value)),
    };
  });
}
function distance(left, right, index) {
  const offset = index * 4;
  let result = 0;
  for (let channel = 0; channel < 4; channel++)
    result = Math.max(result, Math.abs(left[offset + channel] - right[offset + channel]));
  return result;
}
function inside(bounds, x, y) {
  return (
    x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height
  );
}
function fraction(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}
function residue(source, reference, output, index, repeatNoise) {
  const contrast = distance(source, reference, index);
  // Low-contrast AA pixels stay measurable; noise never removes pixels from the ink mask.
  const noise = contrast > repeatNoise ? repeatNoise : 0;
  return Math.max(
    0,
    Math.min(1, (distance(output, reference, index) - noise) / (contrast - noise))
  );
}
function damage() {
  return {
    pixels: 0,
    changed: 0,
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  };
}
function addDamage(group, x, y, changed) {
  group.pixels++;
  if (!changed) return;
  group.changed++;
  group.left = Math.min(group.left, x);
  group.top = Math.min(group.top, y);
  group.right = Math.max(group.right, x + 1);
  group.bottom = Math.max(group.bottom, y + 1);
}
function damageFinding(type, group) {
  return {
    type,
    fragmentId: null,
    text: null,
    tags: [],
    rects: [
      {
        x: group.left,
        y: group.top,
        width: group.right - group.left,
        height: group.bottom - group.top,
      },
    ],
    value: fraction(group.changed, group.pixels),
    affectedPixels: group.changed,
  };
}
function fragmentInk(fragment, inkMask, width, height) {
  const result = new Set();
  for (const bounds of fragment.rects) {
    // One source pixel is localization tolerance only; every original AA ink pixel is retained.
    const left = Math.max(0, Math.ceil(bounds.x - 1.5));
    const top = Math.max(0, Math.ceil(bounds.y - 1.5));
    const right = Math.min(width, Math.ceil(bounds.x + bounds.width + 0.5));
    const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height + 0.5));
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const index = y * width + x;
        if (inkMask[index]) result.add(index);
      }
  }
  return result;
}
function evaluateFragment(fragment, indices, args) {
  const { source, reference, output, width, region, repeatNoise } = args;
  let insideInkPixels = 0,
    outsideInkPixels = 0,
    remaining = 0,
    remainingPixels = 0,
    outsideChangedPixels = 0;
  for (const index of indices) {
    const x = index % width,
      y = Math.floor(index / width);
    if (!inside(region, x, y)) {
      outsideInkPixels++;
      if (distance(output, source, index) > repeatNoise) outsideChangedPixels++;
    } else {
      insideInkPixels++;
      const value = residue(source, reference, output, index, repeatNoise);
      remaining += value;
      if (value > 0) remainingPixels++;
    }
  }
  const remainingFraction = fraction(remaining, insideInkPixels);
  const status =
    insideInkPixels === 0
      ? 'not-applicable'
      : remainingFraction === 0
        ? 'pass'
        : remainingFraction === 1
          ? 'full-miss'
          : 'partial-cleanup';
  return {
    ...fragment,
    inkPixels: indices.size,
    insideInkPixels,
    outsideInkPixels,
    remainingFraction,
    remainingPixels,
    outsideChangedPixels,
    outsideChangedFraction: fraction(outsideChangedPixels, outsideInkPixels),
    status,
  };
}
/**
 * Evaluate erase output against an independent paired render, without changing any input.
 * RGBA planes are Uint8Array; masks are binary bytes. Expected pixels are reference inside
 * the integer region and source outside. Local control statuses are not a tuned quality target.
 */
export function evaluateRaster(input) {
  if (!record(input)) invalid('Invalid oracle input');
  const { source, reference, output, width, height, inkMask, protectedMask } = input;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    invalid('Invalid oracle dimensions');
  const count = width * height;
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(count * 4))
    invalid('Invalid oracle dimensions');
  for (const plane of [source, reference, output]) assertPlane(plane, count * 4, false);
  for (const mask of [inkMask, protectedMask]) assertPlane(mask, count, true);
  const region = rect(input.region, true);
  if (
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.width > width ||
    region.y + region.height > height
  )
    invalid('Oracle region must be inside the raster');
  const { repeatNoise } = configuration(input.thresholds),
    fragments = annotations(input.fragments);
  const background = damage(),
    protectedPixels = damage(),
    outside = damage();
  let inkPixels = 0,
    insideInkPixels = 0,
    outsideInkPixels = 0,
    remaining = 0,
    remainingPixels = 0;
  for (let index = 0; index < count; index++) {
    const x = index % width,
      y = Math.floor(index / width),
      inRegion = inside(region, x, y);
    const contrast = distance(source, reference, index);
    if (inkMask[index] && contrast === 0) invalid('Oracle ink has no source contrast');
    if (!inkMask[index] && contrast > repeatNoise)
      invalid('Oracle reference changes unmasked pixels');
    const changed = distance(output, inRegion ? reference : source, index) > repeatNoise;
    if (!inRegion) addDamage(outside, x, y, changed);
    if (protectedMask[index]) addDamage(protectedPixels, x, y, changed);
    else if (!inkMask[index]) addDamage(background, x, y, changed);
    if (!inkMask[index]) continue;
    inkPixels++;
    if (!inRegion) {
      outsideInkPixels++;
      continue;
    }
    insideInkPixels++;
    const value = residue(source, reference, output, index, repeatNoise);
    remaining += value;
    if (value > 0) remainingPixels++;
  }
  const attributed = new Set();
  const evaluated = fragments.map((fragment) => {
    const indices = fragmentInk(fragment, inkMask, width, height);
    for (const index of indices) attributed.add(index);
    return evaluateFragment(fragment, indices, {
      source,
      reference,
      output,
      width,
      region,
      repeatNoise,
    });
  });
  if (attributed.size !== inkPixels) invalid('Oracle ink lacks fragment coordinates');
  const findings = evaluated
    .filter((fragment) => fragment.status === 'full-miss' || fragment.status === 'partial-cleanup')
    .map((fragment) => ({
      type: fragment.status,
      fragmentId: fragment.id,
      text: fragment.text,
      rects: fragment.rects,
      tags: fragment.tags,
      value: fragment.remainingFraction,
      affectedPixels: fragment.remainingPixels,
    }));
  if (background.changed) findings.push(damageFinding('background-damage', background));
  if (protectedPixels.changed) findings.push(damageFinding('protected-damage', protectedPixels));
  if (outside.changed) findings.push(damageFinding('outside-region-change', outside));
  const metrics = {
    inkPixels,
    insideInkPixels,
    outsideInkPixels,
    remainingFraction: fraction(remaining, insideInkPixels),
    remainingPixels,
    backgroundPixels: background.pixels,
    backgroundDamagedPixels: background.changed,
    backgroundDamageFraction: fraction(background.changed, background.pixels),
    protectedPixels: protectedPixels.pixels,
    protectedDamagedPixels: protectedPixels.changed,
    protectedDamageFraction: fraction(protectedPixels.changed, protectedPixels.pixels),
    outsideRegionPixels: outside.pixels,
    outsideRegionChangedPixels: outside.changed,
    outsideRegionChangedFraction: fraction(outside.changed, outside.pixels),
    fullMissFragments: evaluated.filter((fragment) => fragment.status === 'full-miss').length,
    partialCleanupFragments: evaluated.filter((fragment) => fragment.status === 'partial-cleanup')
      .length,
    passedFragments: evaluated.filter((fragment) => fragment.status === 'pass').length,
    notApplicableFragments: evaluated.filter((fragment) => fragment.status === 'not-applicable')
      .length,
    repeatNoise,
  };
  return {
    metrics,
    fragments: evaluated,
    findings,
    status: findings.length ? 'fail' : insideInkPixels ? 'pass' : 'not-applicable',
  };
}
