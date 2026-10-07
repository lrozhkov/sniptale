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
uniform sampler2D surface;
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
void main() {
  float blur = blurAmount(focusA, blurSettings.x, modes.x) + blurAmount(focusB, blurSettings.y, modes.y);
  float radius = blur * 24.0 * outputSize.x / 1920.0;
  vec4 color = texture2D(surface, uv);
  if (radius > 0.05) {
    color *= 4.0;
    for (int i = 0; i < 16; i++) {
      float angle = float(i) * 2.39996323;
      float ring = sqrt((float(i) + 0.5) / 16.0);
      vec2 offset = vec2(cos(angle), sin(angle)) * ring * radius / outputSize;
      color += texture2D(surface, clamp(uv + offset, vec2(0.0), vec2(1.0)));
    }
    color /= 20.0;
  }
  gl_FragColor = color;
}`;
