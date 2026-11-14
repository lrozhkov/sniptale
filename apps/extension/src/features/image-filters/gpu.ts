import { SourceImageFilterError } from './contract';
import type { SourceImageFilterProgram, SourceFilterTexture } from './plan';
import { SOURCE_IMAGE_FILTER_SHADER } from './shader';
type Reservation = { release(): void };
type Uniform = { buffer: GPUBuffer; reservation: Reservation };
type Entry = {
  width: number;
  height: number;
  textures: GPUTexture[];
  reservations: Reservation[];
  uniforms: Uniform[];
  wantedTextures: number;
  wantedUniforms: number;
  failed: boolean;
};
const BYTES_LIMIT = 256 * 1024 * 1024;
const UNIFORM_BYTES = 64;
const modes = {
  color: 0,
  kawase: 1,
  threshold: 2,
  bloom: 3,
  mix: 4,
  monochrome: 5,
  sepia: 6,
  sharpen: 7,
  pixelate: 8,
  vignette: 9,
  grain: 10,
};
/** Borrows the existing compositor device. endFrame follows GPU completion, including aborted work. */
export async function createSourceImageFilterGpu(
  device: GPUDevice,
  reserve: (bytes: number) => Reservation
) {
  const module = device.createShaderModule({ code: SOURCE_IMAGE_FILTER_SHADER });
  const pipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertex' },
    fragment: { module, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  const entries = new Map<string, Entry>(),
    used = new Set<string>();
  let active = false,
    disposed = false,
    allocatedBytes = 0;
  const admit = (bytes: number) => {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || allocatedBytes + bytes > BYTES_LIMIT)
      throw new SourceImageFilterError();
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
  const drop = (key: string, entry: Entry) => {
    entries.delete(key);
    for (const texture of entry.textures) texture.destroy();
    for (const reservation of entry.reservations) reservation.release();
    for (const uniform of entry.uniforms) {
      uniform.buffer.destroy();
      uniform.reservation.release();
    }
  };
  const dropAll = () => {
    for (const [key, entry] of entries) drop(key, entry);
  };
  return {
    get allocatedBytes() {
      return allocatedBytes;
    },
    beginFrame() {
      if (active || disposed) throw new SourceImageFilterError();
      active = true;
      used.clear();
    },
    encode(
      encoder: GPUCommandEncoder,
      source: GPUTexture,
      key: string,
      program: SourceImageFilterProgram
    ): GPUTexture {
      if (!active || disposed) throw new SourceImageFilterError();
      if (!program.steps.length) return source;
      if (
        used.has(key) ||
        !Number.isSafeInteger(source.width) ||
        !Number.isSafeInteger(source.height) ||
        source.width <= 0 ||
        source.height <= 0 ||
        program.scratchCount < 1 ||
        program.scratchCount > 3
      )
        throw new SourceImageFilterError();
      used.add(key);
      let entry = entries.get(key);
      if (entry && (entry.width !== source.width || entry.height !== source.height)) {
        drop(key, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = {
          width: source.width,
          height: source.height,
          textures: [],
          reservations: [],
          uniforms: [],
          wantedTextures: program.scratchCount,
          wantedUniforms: program.steps.length,
          failed: false,
        };
        entries.set(key, entry);
      }
      entry.wantedTextures = program.scratchCount;
      entry.wantedUniforms = program.steps.length;
      try {
        while (entry.textures.length < program.scratchCount) {
          const reservation = admit(source.width * source.height * 8);
          try {
            entry.textures.push(
              device.createTexture({
                size: [source.width, source.height],
                format: 'rgba16float',
                usage: 0x04 | 0x10,
              })
            );
            entry.reservations.push(reservation);
          } catch (error) {
            reservation.release();
            throw error;
          }
        }
        const retained = entry;
        const texture = (id: SourceFilterTexture) => (id === -1 ? source : retained.textures[id]!);
        for (const [index, step] of program.steps.entries()) {
          let uniform = entry.uniforms[index];
          if (!uniform) {
            const reservation = admit(UNIFORM_BYTES);
            try {
              uniform = {
                buffer: device.createBuffer({ size: UNIFORM_BYTES, usage: 0x08 | 0x40 }),
                reservation,
              };
              entry.uniforms.push(uniform);
            } catch (error) {
              reservation.release();
              throw error;
            }
          }
          const data = new ArrayBuffer(UNIFORM_BYTES),
            floats = new Float32Array(data);
          floats.set([source.width, source.height, program.logical.width, program.logical.height]);
          floats.set(step.values, 4);
          const flags = new Uint32Array(data);
          flags[12] = modes[step.kind];
          flags[13] = step.input === -1 ? 1 : 0;
          flags[14] = step.base === -1 ? 1 : 0;
          device.queue.writeBuffer(uniform.buffer, 0, data);
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: entry.textures[step.output]!.createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: [0, 0, 0, 0],
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(
            0,
            device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniform.buffer } },
                { binding: 1, resource: texture(step.input).createView() },
                { binding: 2, resource: texture(step.base).createView() },
                { binding: 3, resource: sampler },
              ],
            })
          );
          pass.draw(3);
          pass.end();
        }
        return texture(program.result);
      } catch (error) {
        entry.failed = true;
        throw error;
      }
    },
    endFrame() {
      if (!active) return;
      active = false;
      if (disposed) {
        dropAll();
        return;
      }
      for (const [key, entry] of entries) {
        if (!used.has(key) || entry.failed) {
          drop(key, entry);
          continue;
        }
        while (entry.textures.length > entry.wantedTextures) {
          entry.textures.pop()!.destroy();
          entry.reservations.pop()!.release();
        }
        while (entry.uniforms.length > entry.wantedUniforms) {
          const uniform = entry.uniforms.pop()!;
          uniform.buffer.destroy();
          uniform.reservation.release();
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!active) dropAll();
    },
  };
}
