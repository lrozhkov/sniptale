/** WebGL1 low-pass levels support arbitrary canvas sizes without POT padding or extensions. */
export function createReviewSpatialTextures(gl: WebGLRenderingContext) {
  const levels: { texture: WebGLTexture; canvas: HTMLCanvasElement }[] = [];
  const dispose = () => {
    for (const level of levels) {
      gl.deleteTexture(level.texture);
      level.canvas.width = level.canvas.height = 1;
    }
    levels.length = 0;
  };
  try {
    // WebGL1 guarantees eight fragment texture units. Each level contains one quarter
    // of the previous level's pixels; the whole pyramid costs less than 4/3 of the base.
    for (let index = 0; index < 8; index++) {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Perspective texture is unavailable.');
      levels.push({ texture, canvas: document.createElement('canvas') });
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    upload(source: HTMLCanvasElement) {
      let previous = source;
      for (const [index, level] of levels.entries()) {
        if (index > 0) {
          const width = Math.max(1, Math.ceil(previous.width / 2));
          const height = Math.max(1, Math.ceil(previous.height / 2));
          if (level.canvas.width !== width || level.canvas.height !== height) {
            level.canvas.width = width;
            level.canvas.height = height;
          }
          const context = level.canvas.getContext('2d');
          if (!context) throw new Error('Perspective filter surface is unavailable.');
          context.clearRect(0, 0, width, height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(previous, 0, 0, width, height);
          previous = level.canvas;
        }
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, level.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, previous);
      }
    },
    dispose,
  };
}
