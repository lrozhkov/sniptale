import {
  GL_TRANSITION_RESOURCES,
  glTransitionUniforms,
  resolveGlTransition,
  type GlTransitionSelection,
} from '../../project/transition/gl-catalog';

const VERTEX = `
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
  let points = array<vec2<f32>,3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
  var result: Vertex;
  result.position = vec4<f32>(points[index],0,1);
  result.uv = points[index] * .5 + .5;
  return result;
}`;
type Reservation = { release(): void };
type AssetLoader = (path: string) => Promise<Uint8Array<ArrayBuffer>>;
type Prepared = { name: string; pipeline: GPURenderPipeline; textures: GPUTexture[] };

/** Reuse the compositor's device. Immutable shader resources are shared; each encoded pass owns a uniform buffer. */
export function createGlTransitionGpu(args: {
  device: GPUDevice;
  format: GPUTextureFormat;
  load: AssetLoader;
  reserve(bytes: number): Reservation;
}) {
  const { device } = args;
  const pipelines = new Map<string, Promise<Prepared>>();
  const textures = new Map<string, Promise<{ texture: GPUTexture; reservation: Reservation }>>();
  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  let disposed = false;
  const load = async (path: string, sha256: string, maximum: number) => {
    const bytes = await args.load(path);
    if (disposed) throw new Error('GL transition backend is disposed.');
    if (bytes.byteLength > maximum) throw new Error('GL transition asset exceeds its budget.');
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (value) => value.toString(16).padStart(2, '0')
    ).join('');
    if (disposed) throw new Error('GL transition backend is disposed.');
    if (digest !== sha256) throw new Error('GL transition asset identity differs.');
    return bytes;
  };
  const texture = (name: string) => {
    let pending = textures.get(name);
    if (pending) return pending;
    pending = (async () => {
      const resource = GL_TRANSITION_RESOURCES.find((entry) => entry.name === name);
      if (!resource) throw new Error('GL transition texture is unavailable.');
      const bytes = await load(
        resource.path,
        resource.sha256,
        resource.width * resource.height * 4
      );
      if (bytes.byteLength !== resource.width * resource.height * 4)
        throw new Error('GL transition texture dimensions differ.');
      const reservation = args.reserve(bytes.byteLength);
      let result: GPUTexture | null = null;
      try {
        result = device.createTexture({
          size: [resource.width, resource.height],
          format: 'rgba8unorm',
          usage: 0x02 | 0x04,
        });
        device.queue.writeTexture({ texture: result }, bytes, { bytesPerRow: resource.width * 4 }, [
          resource.width,
          resource.height,
        ]);
        return { texture: result, reservation };
      } catch (error) {
        result?.destroy();
        reservation.release();
        throw error;
      }
    })();
    textures.set(name, pending);
    void pending.catch(() => {
      if (textures.get(name) === pending) textures.delete(name);
    });
    return pending;
  };
  const prepare = (selection: GlTransitionSelection): Promise<Prepared> => {
    if (disposed) return Promise.reject(new Error('GL transition backend is disposed.'));
    const descriptor = resolveGlTransition(selection);
    if (!descriptor)
      return Promise.reject(new Error('GL transition implementation is unavailable.'));
    let pending = pipelines.get(descriptor.name);
    if (pending) return pending;
    pending = (async () => {
      const bytes = await load(
        descriptor.implementation.wgsl.path,
        descriptor.implementation.wgsl.sha256,
        1024 * 1024
      );
      const module = device.createShaderModule({
        code: new TextDecoder('utf-8', { fatal: true }).decode(bytes) + VERTEX,
      });
      const [pipeline, resources] = await Promise.all([
        device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { module, entryPoint: 'vertex' },
          fragment: {
            module,
            entryPoint: 'main',
            targets: [
              {
                format: args.format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'zero' },
                  alpha: { srcFactor: 'one', dstFactor: 'zero' },
                },
              },
            ],
          },
          primitive: { topology: 'triangle-list' },
        }),
        Promise.all(descriptor.textures.map((name) => texture(name))),
      ]);
      if (disposed) throw new Error('GL transition backend is disposed.');
      return { name: descriptor.name, pipeline, textures: resources.map((entry) => entry.texture) };
    })();
    pipelines.set(descriptor.name, pending);
    void pending.catch(() => {
      if (pipelines.get(descriptor.name) === pending) pipelines.delete(descriptor.name);
    });
    return pending;
  };
  return {
    prepare,
    /** The frame slot releases this buffer only after its existing GPU completion barrier. */
    encode(request: {
      encoder: GPUCommandEncoder;
      prepared: Prepared;
      selection: GlTransitionSelection;
      progress: number;
      ratio: number;
      from: GPUTexture;
      to: GPUTexture;
      destination: GPUTexture;
    }): { release(): void } {
      if (disposed) throw new Error('GL transition backend is disposed.');
      if (request.selection.name !== request.prepared.name)
        throw new Error('GL transition pipeline identity differs.');
      const bytes = glTransitionUniforms(request.selection, request.progress, request.ratio);
      if (!bytes) throw new Error('GL transition parameters are invalid.');
      const reservation = args.reserve(bytes.byteLength);
      let buffer: GPUBuffer | null = null;
      try {
        buffer = device.createBuffer({ size: bytes.byteLength, usage: 0x08 | 0x40 });
        device.queue.writeBuffer(buffer, 0, bytes);
        const group = device.createBindGroup({
          layout: request.prepared.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: request.from.createView() },
            { binding: 3, resource: request.to.createView() },
            ...request.prepared.textures.map((texture, index) => ({
              binding: 4 + index,
              resource: texture.createView(),
            })),
          ],
        });
        const pass = request.encoder.beginRenderPass({
          colorAttachments: [
            {
              view: request.destination.createView(),
              clearValue: [0, 0, 0, 0],
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setPipeline(request.prepared.pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
        let released = false;
        return {
          release() {
            if (!released) {
              released = true;
              buffer?.destroy();
              reservation.release();
            }
          },
        };
      } catch (error) {
        buffer?.destroy();
        reservation.release();
        throw error;
      }
    },
    /** The compositor calls disposal after draining its frame slots. */
    async dispose() {
      if (disposed) return;
      disposed = true;
      const results = await Promise.allSettled(textures.values());
      for (const result of results)
        if (result.status === 'fulfilled') {
          result.value.texture.destroy();
          result.value.reservation.release();
        }
      textures.clear();
      pipelines.clear();
    },
  };
}

/** Only generated package paths reach this loader; redirects and external origins are not admitted. */
export async function loadLocalGlTransitionAsset(path: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!/^video-effects\/transitions\/[A-Za-z0-9_/-]+\.(?:wgsl|glsl|rgba)$/u.test(path))
    throw new Error('GL transition asset path is invalid.');
  const url = new URL(path, new URL('/', location.href));
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('GL transition asset is unavailable.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GL transition asset has no body.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 1024 * 1024) throw new Error('GL transition asset exceeds its budget.');
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const GL_VERTEX = `#version 300 es
precision highp float;
out vec2 _sniptaleUv;
void main() {
  vec2 points[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
  vec2 p=points[gl_VertexID];gl_Position=vec4(p,0,1);_sniptaleUv=p*.5+.5;
}`;
const GL_FRAGMENT_PREFIX = `#version 300 es
precision highp float;
precision highp int;
in vec2 _sniptaleUv;
out vec4 _sniptaleResult;
uniform sampler2D _sniptaleFrom;
uniform sampler2D _sniptaleTo;
uniform float progress;
uniform float ratio;
vec4 _sniptaleStraight(vec4 c){return c.a>0.0?vec4(c.rgb/c.a,c.a):vec4(0);}
vec4 getFromColor(vec2 uv){return _sniptaleStraight(texture(_sniptaleFrom,uv));}
vec4 getToColor(vec2 uv){return _sniptaleStraight(texture(_sniptaleTo,uv));}
`;

/** The fallback graphics owner supplies its context and serializes drawing and publication. */
function createGlTransitionWebGl(args: { gl: WebGL2RenderingContext; load: AssetLoader }) {
  const { gl } = args;
  const programs = new Map<string, Promise<WebGLProgram>>();
  const extras = new Map<string, Promise<WebGLTexture>>();
  const sources: WebGLTexture[] = [];
  const configureBoundTexture = () => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  let disposed = false;
  const check = () => {
    if (disposed || gl.isContextLost()) throw new Error('GL transition fallback is unavailable.');
  };
  const load = async (path: string, identity: string, maximum: number) => {
    const bytes = await args.load(path);
    check();
    if (bytes.byteLength > maximum) throw new Error('GL transition asset exceeds its budget.');
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
      value.toString(16).padStart(2, '0')
    ).join('');
    check();
    if (sha !== identity) throw new Error('GL transition asset identity differs.');
    return bytes;
  };
  const shader = (kind: number, source: string) => {
    const result = gl.createShader(kind);
    if (!result) throw new Error('GL transition shader is unavailable.');
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(result);
      gl.deleteShader(result);
      throw new Error(`GL transition shader failed: ${reason}`);
    }
    return result;
  };
  const prepare = (selection: GlTransitionSelection): Promise<WebGLProgram> => {
    check();
    const descriptor = resolveGlTransition(selection);
    if (!descriptor)
      return Promise.reject(new Error('GL transition implementation is unavailable.'));
    let pending = programs.get(descriptor.name);
    if (pending) return pending;
    pending = (async () => {
      const bytes = await load(
        descriptor.implementation.glsl3.path,
        descriptor.implementation.glsl3.sha256,
        1024 * 1024
      );
      const vertex = shader(gl.VERTEX_SHADER, GL_VERTEX);
      let fragment: WebGLShader | null = null,
        program: WebGLProgram | null = null;
      try {
        fragment = shader(
          gl.FRAGMENT_SHADER,
          GL_FRAGMENT_PREFIX +
            new TextDecoder('utf-8', { fatal: true }).decode(bytes) +
            '\nvoid main(){vec4 c=transition(_sniptaleUv);_sniptaleResult=vec4(c.rgb*c.a,c.a);}\n'
        );
        program = gl.createProgram();
        if (!program) throw new Error('GL transition program is unavailable.');
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(`GL transition link failed: ${gl.getProgramInfoLog(program)}`);
        for (const name of descriptor.textures) {
          if (extras.has(name)) {
            await extras.get(name);
            continue;
          }
          const pendingTexture = (async () => {
            const resource = GL_TRANSITION_RESOURCES.find((entry) => entry.name === name);
            if (!resource) throw new Error('GL transition texture is unavailable.');
            const pixels = await load(
              resource.path,
              resource.sha256,
              resource.width * resource.height * 4
            );
            if (pixels.byteLength !== resource.width * resource.height * 4)
              throw new Error('GL transition texture dimensions differ.');
            const texture = gl.createTexture();
            if (!texture) throw new Error('GL transition texture allocation failed.');
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA8,
              resource.width,
              resource.height,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels
            );
            configureBoundTexture();
            return texture;
          })();
          extras.set(name, pendingTexture);
          void pendingTexture.catch(() => {
            if (extras.get(name) === pendingTexture) extras.delete(name);
          });
          await pendingTexture;
        }
        check();
        return program;
      } catch (error) {
        if (program) gl.deleteProgram(program);
        throw error;
      } finally {
        gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
      }
    })();
    programs.set(descriptor.name, pending);
    void pending.catch(() => {
      if (programs.get(descriptor.name) === pending) programs.delete(descriptor.name);
    });
    return pending;
  };
  return {
    prepare,
    /** Inputs already have source selection, color interpretation, orientation and geometry applied. */
    async render(request: {
      selection: GlTransitionSelection;
      progress: number;
      ratio: number;
      width: number;
      height: number;
      from: HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
      to: HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
      signal: AbortSignal;
      destination?: WebGLFramebuffer | null;
    }) {
      request.signal.throwIfAborted();
      check();
      const packed = glTransitionUniforms(request.selection, request.progress, request.ratio);
      const descriptor = resolveGlTransition(request.selection);
      if (
        !packed ||
        !descriptor ||
        !Number.isSafeInteger(request.width) ||
        !Number.isSafeInteger(request.height) ||
        request.width < 1 ||
        request.height < 1 ||
        request.width * request.height > 3840 * 2160
      )
        throw new Error('GL transition frame is invalid.');
      const program = await prepare(request.selection);
      request.signal.throwIfAborted();
      check();
      gl.useProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, request.destination ?? null);
      gl.viewport(0, 0, request.width, request.height);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const [index, input] of [request.from, request.to].entries()) {
        let texture = sources[index];
        if (!texture) {
          texture = gl.createTexture() ?? undefined;
          if (!texture) throw new Error('GL transition input allocation failed.');
          sources[index] = texture;
        }
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, input!);
        configureBoundTexture();
        gl.uniform1i(
          gl.getUniformLocation(program, index === 0 ? '_sniptaleFrom' : '_sniptaleTo'),
          index
        );
      }
      for (const [index, name] of descriptor.textures.entries()) {
        const texture = await extras.get(name);
        request.signal.throwIfAborted();
        check();
        if (!texture) throw new Error('GL transition texture is unavailable.');
        gl.activeTexture(gl.TEXTURE0 + index + 2);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(program, name), index + 2);
      }
      const bytes = new DataView(packed);
      for (const uniform of descriptor.layout.uniforms) {
        const location = gl.getUniformLocation(program, uniform.name);
        switch (uniform.type) {
          case 'bool':
          case 'int':
            gl.uniform1i(location, bytes.getInt32(uniform.offset, true));
            break;
          case 'float':
            gl.uniform1f(location, bytes.getFloat32(uniform.offset, true));
            break;
          case 'ivec2':
            gl.uniform2iv(location, new Int32Array(packed, uniform.offset, 2));
            break;
          case 'vec2':
            gl.uniform2fv(location, new Float32Array(packed, uniform.offset, 2));
            break;
          case 'vec3':
            gl.uniform3fv(location, new Float32Array(packed, uniform.offset, 3));
            break;
          case 'vec4':
            gl.uniform4fv(location, new Float32Array(packed, uniform.offset, 4));
            break;
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('GL transition drawing failed.');
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const [compiled, loaded] = await Promise.all([
        Promise.allSettled(programs.values()),
        Promise.allSettled(extras.values()),
      ]);
      for (const result of compiled)
        if (result.status === 'fulfilled') gl.deleteProgram(result.value);
      for (const result of loaded)
        if (result.status === 'fulfilled') gl.deleteTexture(result.value);
      for (const source of sources) gl.deleteTexture(source);
      programs.clear();
      extras.clear();
      sources.length = 0;
    },
  };
}

/** Serial fallback owner. Inputs stay borrowed until the completed shader result is copied to the caller. */
export function createGlTransitionCanvas(
  args: {
    ownerDocument: Pick<Document, 'createElement'>;
    reserve(bytes: number): Reservation;
  },
  createBackend: typeof createGlTransitionWebGl = createGlTransitionWebGl
) {
  let surface:
    | {
        canvas: HTMLCanvasElement;
        gl: WebGL2RenderingContext;
        backend: ReturnType<typeof createGlTransitionWebGl>;
        reservation: Reservation;
      }
    | undefined;
  let active = false,
    disposed = false;
  const lifetime = new AbortController();
  const retire = () => {
    if (active || !disposed || !surface) return;
    const previous = surface;
    surface = undefined;
    const release = () => {
      try {
        previous.gl.getExtension('WEBGL_lose_context')?.loseContext();
      } finally {
        previous.canvas.width = previous.canvas.height = 0;
        previous.reservation.release();
      }
    };
    void previous.backend.dispose().then(release, release);
  };
  return {
    dispose() {
      disposed = true;
      lifetime.abort();
      retire();
    },
    async render(
      request: Omit<
        Parameters<ReturnType<typeof createGlTransitionWebGl>['render']>[0],
        'destination'
      > & { context: CanvasRenderingContext2D }
    ): Promise<void> {
      if (disposed) throw new Error('GL transition fallback is disposed.');
      if (active) throw new Error('GL transition fallback frame is already in flight.');
      const signal = AbortSignal.any([request.signal, lifetime.signal]);
      signal.throwIfAborted();
      if (
        !Number.isSafeInteger(request.width) ||
        !Number.isSafeInteger(request.height) ||
        request.width <= 0 ||
        request.height <= 0 ||
        request.width * request.height > 3840 * 2160 ||
        !glTransitionUniforms(request.selection, request.progress, request.ratio)
      )
        throw new Error('GL transition frame is invalid.');
      active = true;
      try {
        const bytes = request.width * request.height * 12 + 32768;
        if (!surface) {
          const reservation = args.reserve(bytes);
          let gl: WebGL2RenderingContext | null = null;
          try {
            const canvas = args.ownerDocument.createElement('canvas');
            canvas.width = request.width;
            canvas.height = request.height;
            gl = canvas.getContext('webgl2', {
              alpha: true,
              premultipliedAlpha: true,
              antialias: false,
              depth: false,
              stencil: false,
            });
            if (!gl) throw new Error('GL transition fallback is unavailable.');
            surface = {
              canvas,
              gl,
              backend: createBackend({ gl, load: loadLocalGlTransitionAsset }),
              reservation,
            };
          } catch (error) {
            try {
              gl?.getExtension('WEBGL_lose_context')?.loseContext();
            } finally {
              reservation.release();
            }
            throw error;
          }
        } else if (
          surface.canvas.width !== request.width ||
          surface.canvas.height !== request.height
        ) {
          const reservation = args.reserve(bytes);
          surface.reservation.release();
          surface.reservation = reservation;
          surface.canvas.width = request.width;
          surface.canvas.height = request.height;
        }
        await surface.backend.render({ ...request, signal });
        signal.throwIfAborted();
        request.context.save();
        try {
          request.context.setTransform(1, 0, 0, 1, 0, 0);
          request.context.globalAlpha = 1;
          request.context.globalCompositeOperation = 'copy';
          request.context.filter = 'none';
          request.context.shadowColor = 'transparent';
          request.context.shadowBlur = 0;
          request.context.shadowOffsetX = request.context.shadowOffsetY = 0;
          request.context.drawImage(surface.canvas, 0, 0);
        } finally {
          request.context.restore();
        }
      } finally {
        active = false;
        retire();
      }
    },
  };
}
