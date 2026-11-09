const FILTER_SHADER = `
struct Params { outputSize: vec2f, reduce: u32, encoded: u32 };
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var pixels: texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(positions[index], 0, 1);
}
fn transparentTap(point: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(pixels));
  let coverage = clamp(point * size + .5, vec2f(0), vec2f(1))
               * clamp((vec2f(1) - point) * size + .5, vec2f(0), vec2f(1));
  return textureSampleLevel(pixels, linearSampler, point, 0) * coverage.x * coverage.y;
}
fn row(y: f32, x: vec3f, weight: vec3f) -> vec4f {
  return transparentTap(vec2f(x.x, y)) * weight.x
       + transparentTap(vec2f(x.y, y)) * weight.y
       + transparentTap(vec2f(x.z, y)) * weight.z;
}
@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / u.outputSize;
  if (u.reduce == 0u) { return textureSampleLevel(pixels, linearSampler, uv, 0); }
  let texelSize = vec2f(1) / vec2f(textureDimensions(pixels));
  let pixel = uv / texelSize - .5;
  let phase = fract(pixel);
  let firstWeight = (vec2f(5) - 4 * phase) / 16;
  let lastWeight = (vec2f(1) + 4 * phase) / 16;
  let first = (floor(pixel) - 1.5 + (vec2f(4) - 3 * phase) / (vec2f(5) - 4 * phase)) * texelSize;
  let middle = (floor(pixel) + .5 + (vec2f(4) + 2 * phase) / 10) * texelSize;
  let last = (floor(pixel) + 2.5 + phase / (vec2f(1) + 4 * phase)) * texelSize;
  let x = vec3f(first.x, middle.x, last.x);
  let weight = vec3f(firstWeight.x, .625, lastWeight.x);
  let color = row(first.y, x, weight) * firstWeight.y
            + row(middle.y, x, weight) * .625
            + row(last.y, x, weight) * lastWeight.y;
  // Reduced levels retain absorption, as in the spatial renderer, to preserve faint dark details.
  if (u.encoded == 0u) { return vec4f(color.a - color.rgb, color.a); }
  return color;
}`;

type Reservation = { release(): void };
type Uniform = { buffer: GPUBuffer; reservation: Reservation };
type Entry = {
  texture: GPUTexture;
  textureBytes: number;
  reservation: Reservation;
  uniforms: Uniform[];
};

const MAX_TEXTURE_BYTES = 256 * 1024 * 1024;
const UNIFORM_BYTES = 16;
// WebGPU IDL flag values; the DOM types omit the GPU*Usage namespace constants.
const TEXTURE_USAGE = 0x04 | 0x10;
const UNIFORM_USAGE = 0x08 | 0x40;

function mipSizes(source: GPUTexture) {
  if (
    !Number.isSafeInteger(source.width) ||
    !Number.isSafeInteger(source.height) ||
    source.width <= 0 ||
    source.height <= 0
  )
    throw new Error('GPU preview filter dimensions are unavailable.');
  const sizes = [{ width: source.width, height: source.height }];
  while (sizes.length < 8) {
    const previous = sizes.at(-1);
    if (!previous || (previous.width === 1 && previous.height === 1)) break;
    // Native WebGPU mip dimensions round down; phase-resolved taps use the actual dimensions.
    sizes.push({
      width: Math.max(1, Math.floor(previous.width / 2)),
      height: Math.max(1, Math.floor(previous.height / 2)),
    });
  }
  return sizes;
}

/** Owns half-float filter targets. The caller drains the encoder before endFrame or disposal. */
export async function createGpuPreviewFilter(
  device: GPUDevice,
  reserve: (bytes: number) => Reservation
) {
  const module = device.createShaderModule({ code: FILTER_SHADER });
  const pipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertex' },
    fragment: { module, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const entries = new Map<string, Entry>();
  const used = new Set<string>();
  const prepared = new Map<string, GPUTexture>();
  let active = false;
  let disposed = false;
  let allocatedBytes = 0;
  let textureBytes = 0;
  const admit = (bytes: number) => {
    const reservation = reserve(bytes);
    allocatedBytes += bytes;
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        allocatedBytes -= bytes;
        reservation.release();
      },
    };
  };
  const release = (key: string, entry: Entry) => {
    entries.delete(key);
    entry.texture.destroy();
    entry.reservation.release();
    textureBytes -= entry.textureBytes;
    for (const uniform of entry.uniforms) {
      uniform.buffer.destroy();
      uniform.reservation.release();
    }
  };
  const clear = () => {
    for (const [key, entry] of entries) release(key, entry);
    prepared.clear();
    used.clear();
  };
  const allocate = (source: GPUTexture) => {
    const sizes = mipSizes(source);
    const count = sizes.reduce((sum, size) => sum + size.width * size.height * 8, 0);
    if (!Number.isSafeInteger(count) || count + textureBytes > MAX_TEXTURE_BYTES)
      throw new Error('GPU preview filter texture budget exceeded.');
    const reservation = admit(count);
    const uniforms: Uniform[] = [];
    let texture: GPUTexture | undefined;
    try {
      texture = device.createTexture({
        size: [source.width, source.height],
        mipLevelCount: sizes.length,
        format: 'rgba16float',
        usage: TEXTURE_USAGE,
      });
      for (const [index, size] of sizes.entries()) {
        const uniformReservation = admit(UNIFORM_BYTES);
        let buffer: GPUBuffer | undefined;
        try {
          buffer = device.createBuffer({ size: UNIFORM_BYTES, usage: UNIFORM_USAGE });
          const bytes = new ArrayBuffer(UNIFORM_BYTES);
          new Float32Array(bytes, 0, 2).set([size.width, size.height]);
          new Uint32Array(bytes, 8, 2).set([index > 0 ? 1 : 0, index > 1 ? 1 : 0]);
          device.queue.writeBuffer(buffer, 0, bytes);
          uniforms.push({ buffer, reservation: uniformReservation });
        } catch (error) {
          buffer?.destroy();
          uniformReservation.release();
          throw error;
        }
      }
      textureBytes += count;
      return { texture, textureBytes: count, reservation, uniforms };
    } catch (error) {
      texture?.destroy();
      reservation.release();
      for (const uniform of uniforms) {
        uniform.buffer.destroy();
        uniform.reservation.release();
      }
      throw error;
    }
  };

  return {
    get allocatedBytes() {
      return allocatedBytes;
    },
    beginFrame() {
      if (disposed) throw new Error('GPU preview filter is disposed.');
      if (active) throw new Error('GPU preview filter frame is already active.');
      active = true;
      used.clear();
      prepared.clear();
    },
    prepare(encoder: GPUCommandEncoder, source: GPUTexture, key: string): GPUTexture {
      if (disposed) throw new Error('GPU preview filter is disposed.');
      if (!active) throw new Error('GPU preview filter frame is not active.');
      const previousSource = prepared.get(key);
      const existing = entries.get(key);
      if (previousSource) {
        if (previousSource !== source || !existing)
          throw new Error('GPU preview filter key has conflicting sources.');
        return existing.texture;
      }
      let entry = existing;
      if (
        entry &&
        (entry.texture.width !== source.width || entry.texture.height !== source.height)
      ) {
        release(key, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = allocate(source);
        entries.set(key, entry);
      }
      used.add(key);
      const retained = entry;
      retained.uniforms.forEach((uniform, level) => {
        const input = level === 0 ? source : retained.texture;
        const inputView = input.createView({
          baseMipLevel: Math.max(0, level - 1),
          mipLevelCount: 1,
        });
        const outputView = retained.texture.createView({ baseMipLevel: level, mipLevelCount: 1 });
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            { view: outputView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(
          0,
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniform.buffer } },
              { binding: 1, resource: sampler },
              { binding: 2, resource: inputView },
            ],
          })
        );
        pass.draw(3);
        pass.end();
      });
      prepared.set(key, source);
      return entry.texture;
    },
    endFrame() {
      if (!active) return;
      active = false;
      if (disposed) {
        clear();
        return;
      }
      for (const [key, entry] of entries) if (!used.has(key)) release(key, entry);
      prepared.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!active) clear();
    },
  };
}
