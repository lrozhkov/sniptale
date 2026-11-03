import type { RenderResources, RenderCanvasLease } from './render-resources';
import {
  quickEditPlaneProjection,
  invertQuickEditProjection,
  quickEditRotationMatrix,
  type QuickEditHomography,
} from '../motion/spatial-geometry';
import type { CameraSpatialFrame as QuickEditSpatialFrame } from '../../project/motion/spatial';
import type { CameraSpatialRect as QuickEditRect } from '../../project/motion/spatial';
import { createReviewSpatialTextures } from './spatial-textures';
import { resolveReviewSpatialFilterLevels } from './spatial-filter-levels';
import {
  REVIEW_SPATIAL_VERTEX,
  REVIEW_SPATIAL_FRAGMENT,
  REVIEW_SPATIAL_BASE_FRAGMENT,
} from './spatial-shaders';

/** The padded source uses scene coordinates; projection always targets the original output. */
interface ReviewSpatialDrawRequest {
  source: HTMLCanvasElement;
  sourceRect: QuickEditRect;
  output: { width: number; height: number };
  base: QuickEditRect;
  target: QuickEditRect;
  frame: QuickEditSpatialFrame;
  projection?: QuickEditHomography;
  planeInverse?: QuickEditHomography;
  sharp?: boolean;
}

function validateSpatialSize(
  gl: WebGLRenderingContext,
  role: 'source' | 'output',
  size: { width: number; height: number }
) {
  const { width, height } = size;
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(width * height * (role === 'source' ? 8 : 4))
  )
    throw new Error('Perspective output size is unavailable.');
  if (role === 'source') {
    const texture: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (
      typeof texture !== 'number' ||
      !Number.isFinite(texture) ||
      width > texture ||
      height > texture
    )
      throw new Error('Perspective output size is unavailable.');
    return;
  }
  const buffer: unknown = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const viewport: unknown = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  if (
    typeof buffer !== 'number' ||
    !Number.isFinite(buffer) ||
    width > buffer ||
    height > buffer ||
    !(viewport instanceof Int32Array || Array.isArray(viewport)) ||
    typeof viewport[0] !== 'number' ||
    typeof viewport[1] !== 'number' ||
    !Number.isFinite(viewport[0]) ||
    !Number.isFinite(viewport[1]) ||
    width > viewport[0] ||
    height > viewport[1]
  )
    throw new Error('Perspective output size is unavailable.');
}

function validateSpatialDraw(gl: WebGLRenderingContext, args: ReviewSpatialDrawRequest) {
  const { source, sourceRect, output } = args;
  if (
    !Number.isSafeInteger(sourceRect.x) ||
    !Number.isSafeInteger(sourceRect.y) ||
    sourceRect.width !== source.width ||
    sourceRect.height !== source.height
  )
    throw new Error('Perspective output size is unavailable.');
  validateSpatialSize(gl, 'source', source);
  validateSpatialSize(gl, 'output', output);
}

/** Compile one fixed program; the renderer shares its vertex storage across both variants. */
function createSpatialProgram(gl: WebGLRenderingContext, fragmentSource: string, samplers: number) {
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, REVIEW_SPATIAL_VERTEX],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Perspective shader is unavailable.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Perspective shader compilation failed.');
    }
    program = gl.createProgram();
    if (!program) throw new Error('Perspective program is unavailable.');
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Perspective program linking failed.');
    gl.useProgram(program);
    for (let index = 0; index < samplers; index++)
      gl.uniform1i(gl.getUniformLocation(program, `surface${index}`), index);
    const locations = new Map<string, WebGLUniformLocation | null>();
    const current = program;
    return {
      program,
      position: gl.getAttribLocation(program, 'position'),
      uniform(name: string) {
        if (!locations.has(name)) locations.set(name, gl.getUniformLocation(current, name));
        return locations.get(name) ?? null;
      },
      dispose() {
        locations.clear();
        gl.deleteProgram(current);
      },
    };
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

/** Compile the two fixed programs before the session admits surfaces or draw requests. */
function prepareSpatialPipeline(gl: WebGLRenderingContext, resources: RenderResources) {
  const filtered = createSpatialProgram(gl, REVIEW_SPATIAL_FRAGMENT, 8);
  let base: ReturnType<typeof createSpatialProgram> | undefined;
  let buffer: WebGLBuffer | null = null;
  try {
    base = createSpatialProgram(gl, REVIEW_SPATIAL_BASE_FRAGMENT, 1);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Perspective buffers are unavailable.');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    );
    const textures = createReviewSpatialTextures(gl, resources);
    const precision =
      gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    return { filtered, base, buffer, textures, precision };
  } catch (error) {
    filtered.dispose();
    base?.dispose();
    if (buffer) gl.deleteBuffer(buffer);
    throw error;
  }
}

function spatialInverse(args: ReviewSpatialDrawRequest) {
  const projection =
    args.projection ?? quickEditPlaneProjection(args.base, args.target, args.frame);
  if (
    !projection.every(Number.isFinite) ||
    (args.planeInverse && !args.planeInverse.every(Number.isFinite))
  )
    throw new Error('Perspective projection is unavailable.');
  const inverse = invertQuickEditProjection(projection);
  if (!inverse) throw new Error('Perspective projection is unavailable.');
  return inverse;
}

/** Projection and focus uniforms describe one frame independently of texture lifetime. */
function setSpatialFrameUniforms(
  gl: WebGLRenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  args: {
    base: QuickEditRect;
    target: QuickEditRect;
    frame: QuickEditSpatialFrame;
    projection?: QuickEditHomography;
    planeInverse?: QuickEditHomography;
    sharp: boolean;
    output: { width: number; height: number };
    sourceRect: QuickEditRect;
    inverse: QuickEditHomography;
    baseOnly: boolean;
  }
) {
  const { base, frame, sharp, output, inverse } = args;
  const matrix = (name: string, value: QuickEditHomography) =>
    gl.uniformMatrix3fv(
      uniform(name),
      false,
      new Float32Array([
        value[0],
        value[3],
        value[6],
        value[1],
        value[4],
        value[7],
        value[2],
        value[5],
        value[8],
      ])
    );
  matrix('inverseProjection', inverse);
  gl.uniform2f(uniform('outputSize'), output.width, output.height);
  const source = args.sourceRect;
  gl.uniform4f(uniform('sourceRect'), source.x, source.y, source.width, source.height);
  if (args.baseOnly) return;
  matrix('inversePlane', args.planeInverse ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  gl.uniform4f(uniform('windowRect'), base.x, base.y, base.width, base.height);
  const rotation = quickEditRotationMatrix(frame.rotation);
  gl.uniform2f(uniform('depthAxis'), rotation[6]!, rotation[7]!);
  const focuses = sharp ? [] : frame.focus;
  for (const [index, name] of ['focusA', 'focusB'].entries()) {
    const focus = focuses[index];
    gl.uniform4f(
      uniform(name),
      focus?.settings.x ?? 0.5,
      focus?.settings.y ?? 0.5,
      focus?.settings.width ?? 1,
      focus ? focus.settings.strength * focus.weight : 0
    );
  }
  gl.uniform4f(
    uniform('blurSettings'),
    focuses[0]?.settings.softness ?? 1,
    focuses[1]?.settings.softness ?? 1,
    0,
    0
  );
  gl.uniform2f(
    uniform('modes'),
    focuses[0]?.settings.mode === 'depth' ? 1 : 0,
    focuses[1]?.settings.mode === 'depth' ? 1 : 0
  );
}

/** Retains admitted raster surfaces and their byte reservations independently of GL programs. */
function createSpatialRenderStorage(resources: RenderResources) {
  const leases = new Map<string, RenderCanvasLease>();
  let drawingBuffer: { release(): void } | undefined;
  // CPU vertex/matrix arrays plus the explicit GL vertex-buffer storage.
  const arrays = resources.bytes('spatial-vertex-and-matrices', 48 + 48 + 36);
  return {
    surface(kind: 'plane' | 'overlay' | 'exposure', width: number, height: number) {
      let lease = leases.get(kind);
      if (lease && (lease.canvas.width !== width || lease.canvas.height !== height)) {
        lease.release();
        leases.delete(kind);
        lease = undefined;
      }
      if (!lease) {
        lease = resources.canvas(`spatial-${kind}`, { width, height });
        leases.set(kind, lease);
      }
      lease.context.clearRect(0, 0, width, height);
      return { canvas: lease.canvas, context: lease.context };
    },
    resizeOutput(canvas: HTMLCanvasElement, output: { width: number; height: number }) {
      if (canvas.width === output.width && canvas.height === output.height) return;
      canvas.width = 0;
      canvas.height = 0;
      drawingBuffer?.release();
      drawingBuffer = undefined;
      drawingBuffer = resources.bytes('spatial-drawing-buffer', output.width * output.height * 4);
      canvas.width = output.width;
      canvas.height = output.height;
    },
    dispose() {
      drawingBuffer?.release();
      drawingBuffer = undefined;
      arrays.release();
      for (const lease of leases.values()) lease.release();
      leases.clear();
    },
  };
}

/** Owns one GPU context and its admitted resources. The caller owns the supplied ledger. */
export function createReviewSpatialRenderer(
  onContextLost: (() => void) | undefined,
  resources: RenderResources
) {
  const canvas = document.createElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  let storage: ReturnType<typeof createSpatialRenderStorage> | undefined;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    // The full-screen quad has no geometry edges; source coverage is sampled in the shader.
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('Perspective renderer is unavailable.');
  try {
    storage = createSpatialRenderStorage(resources);
    const retained = storage;
    const {
      filtered,
      base: baseProgram,
      buffer,
      textures,
      precision,
    } = prepareSpatialPipeline(gl, resources);
    let disposed = false;
    const lost = () => {
      if (!disposed) {
        dispose();
        onContextLost?.();
      }
    };
    canvas.addEventListener('webglcontextlost', lost);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      textures.dispose();
      gl.deleteBuffer(buffer);
      filtered.dispose();
      baseProgram.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = 0;
      canvas.height = 0;
      retained.dispose();
    };
    return {
      /** Admit all dimensions before a caller allocates either capture or output surfaces. */
      validateSizes(
        source: { width: number; height: number },
        output: { width: number; height: number }
      ) {
        if (disposed || gl.isContextLost()) throw new Error('Perspective context was lost.');
        validateSpatialSize(gl, 'source', source);
        validateSpatialSize(gl, 'output', output);
      },
      surface(kind: 'plane' | 'overlay' | 'exposure', width: number, height: number) {
        if (disposed || gl.isContextLost()) throw new Error('Perspective context was lost.');
        validateSpatialSize(gl, kind === 'exposure' ? 'output' : 'source', { width, height });
        try {
          return retained.surface(kind, width, height);
        } catch (error) {
          dispose();
          throw error;
        }
      },
      /** Projects a transparent base scene; background and viewport overlays stay outside this pass. */
      draw(context: CanvasRenderingContext2D, args: ReviewSpatialDrawRequest) {
        try {
          validateSpatialDraw(gl, args);
          const { source, output, base, target, frame, sourceRect, sharp = false } = args;
          if (disposed || gl.isContextLost()) throw new Error('Perspective context was lost.');
          if (
            !sharp &&
            !textures.supportsDepth &&
            frame.focus.some((focus) => focus.weight * focus.settings.strength > 0)
          )
            throw new Error('Depth renderer precision is unavailable.');
          retained.resizeOutput(canvas, output);
          if (gl.drawingBufferWidth !== output.width || gl.drawingBufferHeight !== output.height)
            throw new Error('Perspective output size is unavailable.');
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          const inverse = spatialInverse(args);
          const levelCount = resolveReviewSpatialFilterLevels({
            inverse,
            output,
            precision,
            blurWeights: sharp
              ? []
              : frame.focus.map((focus) => focus.settings.strength * focus.weight),
          });
          const pipeline = levelCount === 1 ? baseProgram : filtered;
          const { program, position, uniform } = pipeline;
          gl.useProgram(program);
          setSpatialFrameUniforms(gl, uniform, {
            base,
            target,
            frame,
            sharp,
            output,
            sourceRect,
            inverse,
            baseOnly: levelCount === 1,
            ...(args.projection ? { projection: args.projection } : {}),
            ...(args.planeInverse ? { planeInverse: args.planeInverse } : {}),
          });
          let levelSizes: Float32Array;
          try {
            levelSizes = textures.upload(source, levelCount);
          } finally {
            gl.useProgram(program);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.viewport(0, 0, canvas.width, canvas.height);
          }
          if (levelCount > 1) gl.uniform2fv(uniform('levelSize[0]'), levelSizes);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Perspective rendering failed.');
          context.drawImage(canvas, 0, 0);
        } catch (error) {
          dispose();
          throw error;
        }
      },
      dispose,
    };
  } catch (error) {
    storage?.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  }
}

export type ReviewSpatialRenderer = ReturnType<typeof createReviewSpatialRenderer>;
