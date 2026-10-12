import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { REVIEW_SPATIAL_FILTER_FRAGMENT, REVIEW_SPATIAL_FILTER_VERTEX } from './spatial-shaders';

/** Centered low-pass levels support arbitrary canvas sizes without POT padding or extensions. */
export function createReviewSpatialTextures(
  gl: WebGLRenderingContext,
  resources?: RenderResources
) {
  const textures: WebGLTexture[] = [];
  const reservations = new Map<number, { release(): void }>();
  let sizeReservation: { release(): void } | undefined;
  let disposed = false;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let framebuffer: WebGLFramebuffer | null = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const reservation of reservations.values()) reservation.release();
    reservations.clear();
    sizeReservation?.release();
    for (const texture of textures) gl.deleteTexture(texture);
    for (const shader of shaders) gl.deleteShader(shader);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (program) gl.deleteProgram(program);
    textures.length = shaders.length = 0;
    framebuffer = null;
    program = null;
  };
  try {
    const halfFloat = gl.getExtension('OES_texture_half_float');
    const supportsDepth = !!(
      halfFloat &&
      gl.getExtension('OES_texture_half_float_linear') &&
      gl.getExtension('EXT_color_buffer_half_float')
    );
    const textureType = supportsDepth && halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, REVIEW_SPATIAL_FILTER_VERTEX],
      [gl.FRAGMENT_SHADER, REVIEW_SPATIAL_FILTER_FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Perspective filter shader is unavailable.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Perspective filter shader compilation failed.');
    }
    program = gl.createProgram();
    if (!program) throw new Error('Perspective filter program is unavailable.');
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Perspective filter program linking failed.');
    for (const shader of shaders) gl.deleteShader(shader);
    shaders.length = 0;
    framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('Perspective filter framebuffer is unavailable.');
    // Eight fragment units are guaranteed. The reduced levels cost less than 1/3
    // of the base pixels; filtering stays on the GPU and preserves premultiplied alpha.
    for (let index = 0; index < 8; index++) {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Perspective texture is unavailable.');
      textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + index);
      initializeSpatialTexture(gl, texture);
    }
    const position = gl.getAttribLocation(program, 'position');
    const surface = gl.getUniformLocation(program, 'surface');
    const texelSize = gl.getUniformLocation(program, 'texelSize');
    const sourceEncoded = gl.getUniformLocation(program, 'sourceEncoded');
    const dimensions: { width: number; height: number }[] = [];
    sizeReservation = resources?.bytes('spatial-level-sizes', 16 * 4);
    const sizes = new Float32Array(16);
    const reserveLevel = (index: number, width: number, height: number) => {
      if (!resources) return;
      const previous = dimensions[index];
      if (previous?.width === width && previous.height === height) return;
      if (reservations.has(index)) {
        const replacement = gl.createTexture();
        if (!replacement) throw new Error('Perspective texture is unavailable.');
        const texture = textures[index];
        if (texture) gl.deleteTexture(texture);
        reservations.get(index)?.release();
        reservations.delete(index);
        textures[index] = replacement;
        initializeSpatialTexture(gl, replacement);
      }
      const pixelBytes = index === 0 || !supportsDepth ? 4 : 8;
      reservations.set(index, resources.bytes('spatial-texture', width * height * pixelBytes));
    };
    return {
      supportsDepth,
      upload(source: HTMLCanvasElement) {
        if (disposed) throw new Error('Perspective textures were disposed.');
        gl.useProgram(program);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        let width = source.width;
        let height = source.height;
        try {
          for (const [index, texture] of textures.entries()) {
            gl.activeTexture(gl.TEXTURE0 + index);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            sizes[index * 2] = width;
            sizes[index * 2 + 1] = height;
            if (index === 0) {
              reserveLevel(index, width, height);
              dimensions[index] = { width, height };
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
              continue;
            }
            const previousWidth = width;
            const previousHeight = height;
            width = Math.max(1, Math.ceil(width / 2));
            height = Math.max(1, Math.ceil(height / 2));
            sizes[index * 2] = width;
            sizes[index * 2 + 1] = height;
            const size = dimensions[index];
            const resized = size?.width !== width || size.height !== height;
            if (resized) {
              reserveLevel(index, width, height);
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                width,
                height,
                0,
                gl.RGBA,
                textureType,
                null
              );
            }
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              gl.TEXTURE_2D,
              textures[index] ?? texture,
              0
            );
            if (resized && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
              throw new Error('Perspective filter framebuffer is incomplete.');
            dimensions[index] = { width, height };
            gl.viewport(0, 0, width, height);
            gl.uniform1i(surface, index - 1);
            gl.uniform1i(sourceEncoded, index > 1 ? 1 : 0);
            gl.uniform2f(texelSize, 1 / previousWidth, 1 / previousHeight);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
          return sizes;
        } catch (error) {
          if (resources) dispose();
          throw error;
        } finally {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function initializeSpatialTexture(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  texture: WebGLTexture
) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
