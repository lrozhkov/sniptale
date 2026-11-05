const geometry = `
struct Params {
  inverse: mat3x4f,
  output: vec4f,
  rect: vec4f,
  clip: vec4f,
  options: vec4f,
  lensRect: vec4f,
  lensOptions: vec4f,
  inversePlane: mat3x4f,
  window: vec4f,
  focusA: vec4f,
  focusB: vec4f,
  blurSettings: vec4f,
  depthOptions: vec4f,
  orientation: vec4f,
};
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var linearSampler: sampler;
@vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(positions[index], 0, 1);
}
fn sourcePoint(position: vec2f) -> vec3f {
  let point = vec3f(position / u.output.xy * u.output.zw, 1);
  return vec3f(dot(u.inverse[0].xyz, point), dot(u.inverse[1].xyz, point), dot(u.inverse[2].xyz, point));
}
fn coverage(point: vec2f) -> f32 {
  if (u.options.z == 0) { return 1; }
  if (u.options.w == 2) {
    return select(0.0, 1.0, all(point >= u.clip.xy) && all(point < u.clip.xy + u.clip.zw));
  }
  if (u.options.x == 0 && u.options.w == 0
      && u.inverse[0].y == 0 && u.inverse[1].x == 0
      && u.inverse[2].x == 0 && u.inverse[2].y == 0
      && u.inverse[0].x != 0 && u.inverse[1].y != 0) {
    let width = max(fwidth(point), vec2f(.0001));
    let sides = clamp((point - u.clip.xy) / width + .5, vec2f(0), vec2f(1))
      * clamp((u.clip.xy + u.clip.zw - point) / width + .5, vec2f(0), vec2f(1));
    return sides.x * sides.y;
  }
  let radius = min(u.options.x, min(u.clip.z, u.clip.w) * .5);
  let delta = abs(point - u.clip.xy - u.clip.zw * .5) - (u.clip.zw * .5 - vec2f(radius));
  let rounded = length(max(delta, vec2f(0))) + min(max(delta.x, delta.y), 0) - radius;
  let ellipse = (length((point - u.clip.xy - u.clip.zw * .5) / (u.clip.zw * .5)) - 1) * min(u.clip.z, u.clip.w) * .5;
  let distance = select(rounded, ellipse, u.options.w == 1);
  return clamp(.5 - distance / max(fwidth(distance), .0001), 0, 1);
}
fn samplingCoverage(uv: vec2f, size: vec2f) -> f32 {
  let flags = u32(u.orientation.w);
  let low = clamp(uv * size + .5, vec2f(0), vec2f(1));
  let high = clamp((1 - uv) * size + .5, vec2f(0), vec2f(1));
  let x = select(low.x, 1.0, (flags & 1u) != 0u)
    * select(high.x, 1.0, (flags & 4u) != 0u);
  let y = select(low.y, 1.0, (flags & 2u) != 0u)
    * select(high.y, 1.0, (flags & 8u) != 0u);
  return x * y;
}
`;

const filteredSampling = `
var<private> sampleLevel: f32;
fn transparentSample(uv: vec2f, level: f32) -> vec4f {
  let size = vec2f(textureDimensions(pixels, u32(level)));
  return textureSampleLevel(pixels, linearSampler, uv, level) * samplingCoverage(uv, size);
}
fn smoothLevel(uv: vec2f, level: f32) -> vec4f {
  if (level == 0) { return transparentSample(uv, 0); }
  let size = vec2f(textureDimensions(pixels, u32(level)));
  let pixel = uv * size - .5;
  let fraction = fract(pixel);
  let f2 = fraction * fraction;
  let f3 = f2 * fraction;
  let w0 = (1 - 3 * fraction + 3 * f2 - f3) / 6;
  let w1 = (4 - 6 * f2 + 3 * f3) / 6;
  let w2 = (1 + 3 * fraction + 3 * f2 - 3 * f3) / 6;
  let w3 = f3 / 6;
  let left = w0 + w1;
  let right = w2 + w3;
  let first = (floor(pixel) - .5 + w1 / left) / size;
  let second = (floor(pixel) + 1.5 + w3 / right) / size;
  let color = transparentSample(first, level) * left.x * left.y
    + transparentSample(vec2f(second.x, first.y), level) * right.x * left.y
    + transparentSample(vec2f(first.x, second.y), level) * left.x * right.y
    + transparentSample(second, level) * right.x * right.y;
  return vec4f(vec3f(color.a) - color.rgb, color.a);
}
fn filteredColor(uv: vec2f) -> vec4f {
  let level = clamp(sampleLevel, 0, f32(textureNumLevels(pixels) - 1));
  if (level == 0) { return transparentSample(uv, 0); }
  let lower = floor(level);
  let lowerColor = smoothLevel(uv, lower);
  let fraction = level - lower;
  if (fraction == 0) { return lowerColor; }
  let upper = min(lower + 1, f32(textureNumLevels(pixels) - 1));
  return mix(lowerColor, smoothLevel(uv, upper), fraction);
}
fn blurAmount(point: vec2f, focus: vec4f, softness: f32, mode: f32) -> f32 {
  let p = vec3f(point, 1);
  let local = vec3f(dot(u.inversePlane[0].xyz, p), dot(u.inversePlane[1].xyz, p), dot(u.inversePlane[2].xyz, p));
  let normalized = (local.xy / local.z - u.window.xy) / u.window.zw;
  let delta = (normalized - focus.xy) * u.window.zw / length(u.window.zw);
  let distance = select(length(delta), abs(dot(delta, u.depthOptions.xy)), mode == 1);
  return smoothstep(focus.z * .5, focus.z * .5 + max(.005, softness), distance) * focus.w;
}
fn filterLevel(position: vec2f, point: vec2f) -> f32 {
  if (textureNumLevels(pixels) == 1) { return 0; }
  let nativeSize = vec2f(textureDimensions(pixels));
  let size = select(nativeSize, nativeSize.yx, abs(u.orientation.y) > .5);
  let texelScale = size / u.rect.zw;
  let nextX = sourcePoint(position + vec2f(1, 0));
  let nextY = sourcePoint(position + vec2f(0, 1));
  let footprint = max(length((nextX.xy / nextX.z - point) * texelScale),
    length((nextY.xy / nextY.z - point) * texelScale));
  let amount = blurAmount(point, u.focusA, u.blurSettings.x, u.blurSettings.z)
    + blurAmount(point, u.focusB, u.blurSettings.y, u.blurSettings.w);
  let radius = max(u.depthOptions.z, amount * 24 * u.output.z / 1920) * max(texelScale.x, texelScale.y);
  return log2(max(1, max(footprint / max(1, u.lensOptions.x), radius)));
}
`;

/** Both shader variants use the same inverse projection and premultiplied composition. */
function baseGpuPreviewShader(external: boolean, effects = true, masked = false): string {
  const frameGeometry = masked
    ? geometry.replace('  orientation: vec4f,', '  orientation: vec4f,\n  alphaMaskRect: vec4f,')
    : geometry;
  const alphaMask = masked
    ? `
@group(0) @binding(3) var alphaPixels: texture_2d<f32>;
fn alphaCoverage(point: vec2f) -> f32 {
  let uv = (point - u.alphaMaskRect.xy) / u.alphaMaskRect.zw;
  if (any(uv < vec2f(0)) || any(uv > vec2f(1))) { return 0; }
  let size = vec2f(textureDimensions(alphaPixels));
  let edge = clamp(uv * size + .5, vec2f(0), vec2f(1)) * clamp((1 - uv) * size + .5, vec2f(0), vec2f(1));
  return textureSampleLevel(alphaPixels, linearSampler, uv, 0).a * edge.x * edge.y;
}
fn applyAlphaMask(point: vec2f, color: vec4f) -> vec4f {
  // Match both RGBA8 attachment writes of the source-plus-mask group.
  let source = round(clamp(color, vec4f(0), vec4f(1)) * 255) / 255;
  return round(source * alphaCoverage(point) * 255) / 255;
}
`
    : '';
  const withMask = (color: string) => (masked ? `applyAlphaMask(point, ${color})` : color);
  if (!effects)
    return `${frameGeometry}
@group(0) @binding(2) var pixels: ${external ? 'texture_external' : 'texture_2d<f32>'};${alphaMask}
@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let projected = sourcePoint(position.xy);
  let point = projected.xy / projected.z;
  let alpha = coverage(point) * u.options.y;
  let displayUV = (point - u.rect.xy) / u.rect.zw;
  if (projected.z <= 0 || alpha == 0 || any(displayUV < vec2f(0)) || any(displayUV > vec2f(1))) { return vec4f(0); }
  let centered = vec2f(select(displayUV.x, 1 - displayUV.x, u.orientation.z == 1), displayUV.y) - .5;
  let uv = vec2f(u.orientation.x * centered.x + u.orientation.y * centered.y,
    -u.orientation.y * centered.x + u.orientation.x * centered.y) + .5;
  ${
    external
      ? `return ${withMask('textureSampleBaseClampToEdge(pixels, linearSampler, uv) * alpha')};`
      : `
  let size = vec2f(textureDimensions(pixels));
  return ${withMask('textureSampleLevel(pixels, linearSampler, uv, 0) * samplingCoverage(uv, size) * alpha')};`
  }
}`;
  return `${frameGeometry}
@group(0) @binding(2) var pixels: ${external ? 'texture_external' : 'texture_2d<f32>'};${alphaMask}
${external ? '' : filteredSampling}
fn sampleColor(point: vec2f) -> vec4f {
  let displayUV = (point - u.rect.xy) / u.rect.zw;
  if (any(displayUV < vec2f(0)) || any(displayUV > vec2f(1))) { return vec4f(0); }
  let centered = vec2f(select(displayUV.x, 1 - displayUV.x, u.orientation.z == 1), displayUV.y) - .5;
  let uv = vec2f(u.orientation.x * centered.x + u.orientation.y * centered.y,
    -u.orientation.y * centered.x + u.orientation.x * centered.y) + .5;
  return ${external ? 'textureSampleBaseClampToEdge(pixels, linearSampler, uv)' : 'filteredColor(uv)'};
}
fn lensColor(point: vec2f) -> vec4f {
  if (u.lensOptions.x == 0) { return sampleColor(point); }
  let center = u.lensRect.xy + u.lensRect.zw * .5;
  let delta = point - center;
  let sharp = sampleColor(center + delta / u.lensOptions.x);
  if (u.lensOptions.y == 0) { return sharp; }
  let normalized = delta / (u.lensRect.zw * .5);
  let halfSize = u.lensRect.zw / min(u.lensRect.z, u.lensRect.w);
  let corner = max(0, u.lensOptions.w);
  let q = abs(normalized * halfSize) - (halfSize - vec2f(corner));
  let rounded = 1 + length(max(q, vec2f(0))) + min(max(q.x, q.y), 0) - corner;
  let distance = select(rounded, length(normalized), u.lensOptions.w < 0);
  let width = clamp(u.lensOptions.z / 100, .01, .3);
  if (distance <= 1 - width || distance >= 1) { return sharp; }
  let shoulder = (distance - (1 - width)) / width;
  let bend = shoulder * shoulder * (3 - 2 * shoulder);
  let scale = mix(u.lensOptions.x, 1, bend);
  let sine = sin(3.14159265359 * shoulder);
  let dispersion = sine * sine * .012 * min(1, u.lensOptions.x - 1);
  let red = sampleColor(center + delta * (1 / scale - dispersion));
  let green = sampleColor(center + delta / scale);
  let blue = sampleColor(center + delta * (1 / scale + dispersion));
  let edge = exp(-pow((1 - shoulder) / .08, 2));
  let light = max(0, (-normalized.x - normalized.y) / max(.001, length(normalized) * 1.41421356237));
  let highlight = edge * (.12 + .38 * light);
  let shade = exp(-pow((shoulder - .88) / .14, 2)) * .12 * (1 - light);
  let rgb = vec3f(red.r, green.g, blue.b);
  let glass = vec4f(rgb * (1 - shade) + (vec3f(green.a) - rgb) * highlight, green.a);
  let fade = min(1, shoulder / .2);
  return mix(sharp, glass, fade * fade * (3 - 2 * fade));
}
@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let projected = sourcePoint(position.xy);
  let point = projected.xy / projected.z;
  let alpha = coverage(point) * u.options.y;
  if (projected.z <= 0 || alpha == 0) { return vec4f(0); }
  if (u.lensOptions.x == 0) {
    let displayUV = (point - u.rect.xy) / u.rect.zw;
    if (any(displayUV < vec2f(0)) || any(displayUV > vec2f(1))) { return vec4f(0); }
  }
  ${external ? '' : 'sampleLevel = filterLevel(position.xy, point);'}
  return ${withMask('lensColor(point) * alpha')};
}`;
}

/** Operation clipping applies even when the projected source contributes transparent pixels. */
export function gpuPreviewShader(
  external: boolean,
  effects = true,
  masked = false,
  operation: { clip: boolean; tint: boolean } = { clip: false, tint: false }
): string {
  const base = baseGpuPreviewShader(external, effects, masked);
  if (!operation.clip && !operation.tint) return base;
  const fields = `${masked ? '' : '  alphaMaskRect: vec4f,\n'}  tint: vec4f,\n  operationOptions: vec4f,\n`;
  const shader = base.replace(
    '  orientation: vec4f,\n',
    `  orientation: vec4f,\n${masked ? '' : fields}`
  );
  const extended = masked
    ? shader.replace('  alphaMaskRect: vec4f,\n', `  alphaMaskRect: vec4f,\n${fields}`)
    : shader;
  return (
    extended.replace(
      '@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0)',
      'fn sourceFragment(position: vec4f) ->'
    ) +
    `
${operation.clip ? '@group(0) @binding(4) var operationPixels: texture_2d<f32>;' : ''}
@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var color = sourceFragment(position);
  ${operation.tint ? 'color = vec4f(u.tint.rgb * color.a * u.tint.a, color.a * u.tint.a);' : ''}
  ${
    operation.clip
      ? `let c = textureSampleLevel(operationPixels, linearSampler, position.xy / u.output.xy, 0).a;
  if (u.operationOptions.x == 1) {
    let alpha = 1 - c + c * color.a;
    return vec4f(0, 0, 0, alpha);
  }
  color *= c;`
      : ''
  }
  return color;
}`
  );
}
