/** Fixed local shaders: no external effect programs or dynamic source input. */
export const REVIEW_SPATIAL_VERTEX = `
attribute vec2 position;
uniform mat3 projection;
uniform vec2 outputSize;
varying vec2 uv;
void main() {
  uv = position;
  vec3 p = projection * vec3(position * outputSize, 1.0);
  gl_Position = vec4(2.0 * p.x / outputSize.x - p.z, p.z - 2.0 * p.y / outputSize.y, 0.0, p.z);
}`;

export const REVIEW_SPATIAL_FRAGMENT = `
precision highp float;
uniform highp sampler2D surface0;
uniform highp sampler2D surface1;
uniform highp sampler2D surface2;
uniform highp sampler2D surface3;
uniform highp sampler2D surface4;
uniform highp sampler2D surface5;
uniform highp sampler2D surface6;
uniform highp sampler2D surface7;
uniform mat3 inverseProjection;
uniform vec2 levelSize[8];
uniform vec2 outputSize;
uniform vec4 windowRect;
uniform vec2 depthAxis;
uniform vec4 focusA;
uniform vec4 focusB;
uniform vec4 blurSettings;
uniform vec2 modes;
varying vec2 uv;
float blurAmount(vec4 focus, float softness, float mode) {
  vec2 point = (uv * outputSize - windowRect.xy) / windowRect.zw;
  vec2 delta = (point - focus.xy) * windowRect.zw / length(windowRect.zw);
  float distance = mode < 0.5 ? length(delta) : abs(dot(delta, depthAxis));
  return smoothstep(focus.z * 0.5, focus.z * 0.5 + max(0.005, softness), distance) * focus.w;
}
// Smooth reconstruction avoids moving tent-shaped peaks in magnified blur levels.
vec4 smoothLevel(highp sampler2D image, vec2 size) {
  vec2 pixel = uv * size - 0.5;
  vec2 fraction = fract(pixel);
  vec2 f2 = fraction * fraction;
  vec2 f3 = f2 * fraction;
  vec2 w0 = (1.0 - 3.0 * fraction + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * fraction + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 left = w0 + w1;
  vec2 right = w2 + w3;
  vec2 first = (floor(pixel) - 0.5 + w1 / left) / size;
  vec2 second = (floor(pixel) + 1.5 + w3 / right) / size;
  vec4 color = texture2D(image, first) * left.x * left.y
       + texture2D(image, vec2(second.x, first.y)) * right.x * left.y
       + texture2D(image, vec2(first.x, second.y)) * left.x * right.y
       + texture2D(image, second) * right.x * right.y;
  return vec4(color.a - color.rgb, color.a);
}
// Interpolated low-pass levels remove sparse-tap ghosts and the retained sharp center.
vec4 filtered(float level) {
  if (level < 1.0) return mix(texture2D(surface0, uv), smoothLevel(surface1, levelSize[1]), level);
  if (level < 2.0) return mix(smoothLevel(surface1, levelSize[1]), smoothLevel(surface2, levelSize[2]), level - 1.0);
  if (level < 3.0) return mix(smoothLevel(surface2, levelSize[2]), smoothLevel(surface3, levelSize[3]), level - 2.0);
  if (level < 4.0) return mix(smoothLevel(surface3, levelSize[3]), smoothLevel(surface4, levelSize[4]), level - 3.0);
  if (level < 5.0) return mix(smoothLevel(surface4, levelSize[4]), smoothLevel(surface5, levelSize[5]), level - 4.0);
  if (level < 6.0) return mix(smoothLevel(surface5, levelSize[5]), smoothLevel(surface6, levelSize[6]), level - 5.0);
  return mix(smoothLevel(surface6, levelSize[6]), smoothLevel(surface7, levelSize[7]), min(1.0, level - 6.0));
}
vec2 sourcePoint(vec2 point) {
  vec3 p = inverseProjection * vec3(point, 1.0);
  return p.xy / p.z;
}
void main() {
  float blur = blurAmount(focusA, blurSettings.x, modes.x) + blurAmount(focusB, blurSettings.y, modes.y);
  float radius = blur * 24.0 * outputSize.x / 1920.0;
  vec2 point = vec2(gl_FragCoord.x, outputSize.y - gl_FragCoord.y);
  vec2 center = sourcePoint(point);
  float footprint = max(length(sourcePoint(point + vec2(1.0, 0.0)) - center),
                        length(sourcePoint(point + vec2(0.0, 1.0)) - center));
  float level = log2(max(1.0, max(footprint, radius)));
  gl_FragColor = filtered(level);
}`;

export const REVIEW_SPATIAL_FILTER_VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

export const REVIEW_SPATIAL_FILTER_FRAGMENT = `
precision highp float;
uniform highp sampler2D surface;
uniform vec2 texelSize;
uniform bool sourceEncoded;
varying vec2 uv;
// Pair the exact binomial taps after resolving the fractional texel phase.
// Fixed offsets are not equivalent when a reduced pixel falls between source texels.
vec4 row(float y, vec3 x, vec3 weight) {
  return texture2D(surface, vec2(x.x, y)) * weight.x
       + texture2D(surface, vec2(x.y, y)) * weight.y
       + texture2D(surface, vec2(x.z, y)) * weight.z;
}
void main() {
  vec2 pixel = uv / texelSize - 0.5;
  vec2 phase = fract(pixel);
  vec2 firstWeight = (5.0 - 4.0 * phase) / 16.0;
  vec2 lastWeight = (1.0 + 4.0 * phase) / 16.0;
  vec2 first = (floor(pixel) - 1.5 + (4.0 - 3.0 * phase) / (5.0 - 4.0 * phase)) * texelSize;
  vec2 middle = (floor(pixel) + 0.5 + (4.0 + 2.0 * phase) / 10.0) * texelSize;
  vec2 last = (floor(pixel) + 2.5 + phase / (1.0 + 4.0 * phase)) * texelSize;
  vec3 x = vec3(first.x, middle.x, last.x);
  vec3 weight = vec3(firstWeight.x, 0.625, lastWeight.x);
  vec4 color = row(first.y, x, weight) * firstWeight.y
             + row(middle.y, x, weight) * 0.625
             + row(last.y, x, weight) * lastWeight.y;
  // Store absorption relative to alpha: faint dark-on-white details stay near
  // zero, where half-float retains their contrast instead of rounding it away.
  gl_FragColor = sourceEncoded ? color : vec4(color.a - color.rgb, color.a);
}`;
