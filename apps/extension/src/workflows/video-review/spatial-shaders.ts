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
uniform sampler2D surface0;
uniform sampler2D surface1;
uniform sampler2D surface2;
uniform sampler2D surface3;
uniform sampler2D surface4;
uniform sampler2D surface5;
uniform sampler2D surface6;
uniform sampler2D surface7;
uniform mat3 inverseProjection;
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
// Interpolated low-pass levels remove sparse-tap ghosts and the retained sharp center.
vec4 filtered(float level) {
  if (level < 1.0) return mix(texture2D(surface0, uv), texture2D(surface1, uv), level);
  if (level < 2.0) return mix(texture2D(surface1, uv), texture2D(surface2, uv), level - 1.0);
  if (level < 3.0) return mix(texture2D(surface2, uv), texture2D(surface3, uv), level - 2.0);
  if (level < 4.0) return mix(texture2D(surface3, uv), texture2D(surface4, uv), level - 3.0);
  if (level < 5.0) return mix(texture2D(surface4, uv), texture2D(surface5, uv), level - 4.0);
  if (level < 6.0) return mix(texture2D(surface5, uv), texture2D(surface6, uv), level - 5.0);
  return mix(texture2D(surface6, uv), texture2D(surface7, uv), min(1.0, level - 6.0));
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
