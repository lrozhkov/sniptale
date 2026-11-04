/** CSS blur uses the three-box approximation specified by Filter Effects and used by Skia. */
function gpuPreviewCssKernel(sigma: number) {
  if (!Number.isFinite(sigma) || sigma < 0) throw new Error('GPU CSS blur is unavailable.');
  const d = Math.max(1, Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5));
  return d % 2 ? [d, d, d] : [d, d, d + 1];
}

type Reservation = { release(): void };
type Settings = { blur?: number; brightness?: number; saturate?: number };
type Resource = { destroy(): void };
type Entry = {
  width: number;
  height: number;
  result: GPUTexture;
  horizontal: GPUTexture;
  moments: GPUBuffer;
  uniforms: GPUBuffer[];
  resources: { resource: Resource; reservation: Reservation }[];
};
const STRIP = 16;
const LIMIT = 256 * 1024 * 1024;
const UNIFORM_BYTES = 48;
const SHADER = `
struct Params {
  size: vec2u, axis: u32, base: u32,
  boxes: vec3u, radius: u32,
  brightness: f32, saturation: f32, empty: u32, unused: u32,
};
struct Pair { hi: vec4f, lo: vec4f };
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var pixels: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> moments: array<vec4f>;
@group(0) @binding(3) var result: texture_storage_2d<rgba16float, write>;
fn plus(a: Pair, b: Pair) -> Pair {
  let s = a.hi + b.hi;
  let v = s - a.hi;
  let e = (a.hi - (s - v)) + (b.hi - v) + a.lo + b.lo;
  let hi = s + e;
  return Pair(hi, e - (hi - s));
}
fn times(a: Pair, b: f32) -> Pair {
  let product = a.hi * b;
  let ah = a.hi * 4097;
  let al = a.hi - (ah - (ah - a.hi));
  let bh = b * 4097;
  let bl = b - (bh - (bh - b));
  let aHigh = a.hi - al;
  let bHigh = b - bl;
  let e = ((aHigh * bHigh - product) + aHigh * bl + al * bHigh) + al * bl + a.lo * b;
  let hi = product + e;
  return Pair(hi, e - (hi - product));
}
fn coordinate(x: u32, line: u32) -> vec2u {
  return select(vec2u(x, line), vec2u(line, x), u.axis == 1);
}
fn length() -> u32 { return select(u.size.x, u.size.y, u.axis == 1); }
fn lines() -> u32 { return select(u.size.y, u.size.x, u.axis == 1); }
@compute @workgroup_size(1) fn prefix(@builtin(global_invocation_id) id: vec3u) {
  let line = u.base + id.x;
  if (line >= lines()) { return; }
  var sums = array<Pair, 3>(Pair(vec4f(0),vec4f(0)), Pair(vec4f(0),vec4f(0)), Pair(vec4f(0),vec4f(0)));
  for (var x = 0u; x < length(); x++) {
    let color = textureLoad(pixels, coordinate(x, line), 0);
    let value = Pair(color, vec4f(0));
    let weighted = times(value, f32(x));
    sums[0] = plus(sums[0], value);
    sums[1] = plus(sums[1], weighted);
    sums[2] = plus(sums[2], times(weighted, f32(x)));
    let offset = (id.x * length() + x) * 6;
    for (var moment = 0u; moment < 3; moment++) {
      moments[offset + moment * 2] = sums[moment].hi;
      moments[offset + moment * 2 + 1] = sums[moment].lo;
    }
  }
}
fn polynomial(a: i32, line: u32) -> Pair {
  if (a < 0) { return Pair(vec4f(0), vec4f(0)); }
  let index = (line * length() + min(u32(a), length() - 1)) * 6;
  let p0 = Pair(moments[index], moments[index + 1]);
  let p1 = Pair(moments[index + 2], moments[index + 3]);
  let p2 = Pair(moments[index + 4], moments[index + 5]);
  let x = f32(a);
  let first = times(times(p0, x + 1), x + 2);
  let second = times(p1, -(2 * x + 3));
  return times(plus(plus(first, second), p2), .5);
}
fn numerator(distance: i32) -> f32 {
  var weight = 0f;
  for (var subset = 0u; subset < 8; subset++) {
    let shift = select(0u, u.boxes.x, (subset & 1) != 0)
      + select(0u, u.boxes.y, (subset & 2) != 0)
      + select(0u, u.boxes.z, (subset & 4) != 0);
    let a = distance + i32(u.radius) - i32(shift);
    if (a >= 0) { weight += select(1f, -1f, (countOneBits(subset) & 1) != 0) * f32((a + 1) * (a + 2)) * .5; }
  }
  return weight;
}
fn filtered(x: u32, localLine: u32, line: u32) -> vec4f {
  if (u.empty == 1) { return vec4f(0); }
  let divisor = f32(u.boxes.x) * f32(u.boxes.y) * f32(u.boxes.z);
  if (u.radius <= 24) {
    var color = vec4f(0);
    for (var delta = -i32(u.radius); delta <= i32(u.radius); delta++) {
      let source = i32(x) - delta;
      if (source >= 0 && source < i32(length())) {
        color += textureLoad(pixels, coordinate(u32(source), line), 0) * (numerator(delta) / divisor);
      }
    }
    return color;
  }
  var sum = Pair(vec4f(0), vec4f(0));
  for (var subset = 0u; subset < 8; subset++) {
    let shift = select(0u, u.boxes.x, (subset & 1) != 0)
      + select(0u, u.boxes.y, (subset & 2) != 0)
      + select(0u, u.boxes.z, (subset & 4) != 0);
    let p = polynomial(i32(x + u.radius) - i32(shift), localLine);
    sum = plus(sum, times(p, select(1f, -1f, (countOneBits(subset) & 1) != 0)));
  }
  return max(vec4f(0), (sum.hi + sum.lo) / divisor);
}
@compute @workgroup_size(64) fn output(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let line = u.base + id.y;
  if (x >= length() || line >= lines()) { return; }
  var color = filtered(x, id.y, line);
  if (u.axis == 1 && color.a > 0) {
    let bright = clamp(color.rgb / color.a * u.brightness, vec3f(0), vec3f(1));
    let luminance = dot(bright, vec3f(.213, .715, .072));
    let saturated = clamp(vec3f(luminance) + u.saturation * (bright - luminance), vec3f(0), vec3f(1));
    color = vec4f(saturated * color.a, color.a);
  }
  textureStore(result, coordinate(x, line), color);
}`;

/** Owns bounded CSS-filter scratch; its caller must settle the GPU fence before endFrame/dispose. */
export async function createGpuPreviewCssFilter(
  device: GPUDevice,
  reserve: (bytes: number) => Reservation
) {
  const module = device.createShaderModule({ code: SHADER });
  const [prefixPipeline, outputPipeline] = await Promise.all(
    ['prefix', 'output'].map((entryPoint) =>
      device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint } })
    )
  );
  if (!prefixPipeline || !outputPipeline)
    throw new Error('GPU CSS filter pipeline is unavailable.');
  const entries = new Map<string, Entry>();
  const used = new Set<string>();
  const prepared = new Map<string, { source: GPUTexture; settings: string }>();
  let allocatedBytes = 0;
  let active = false;
  let disposed = false;
  const release = (key: string, entry: Entry) => {
    entries.delete(key);
    for (const { resource, reservation } of entry.resources) {
      resource.destroy();
      reservation.release();
    }
  };
  const allocate = (source: GPUTexture): Entry => {
    const resources: Entry['resources'] = [];
    const admit = <T extends Resource>(count: number, create: () => T) => {
      if (!Number.isSafeInteger(count) || count < 0 || count + allocatedBytes > LIMIT)
        throw new Error('GPU CSS filter resource budget exceeded.');
      const admitted = reserve(count);
      allocatedBytes += count;
      const reservation = {
        release() {
          allocatedBytes -= count;
          admitted.release();
        },
      };
      try {
        const resource = create();
        resources.push({ resource, reservation });
        return resource;
      } catch (error) {
        reservation.release();
        throw error;
      }
    };
    try {
      const texture = () =>
        admit(source.width * source.height * 8, () =>
          device.createTexture({
            size: [source.width, source.height],
            format: 'rgba16float',
            usage: 0x04 | 0x08,
          })
        );
      const horizontal = texture();
      const result = texture();
      const moments = admit(Math.max(source.width, source.height) * STRIP * 96, () =>
        device.createBuffer({
          size: Math.max(source.width, source.height) * STRIP * 96,
          usage: 0x80,
        })
      );
      const uniforms = Array.from(
        { length: Math.ceil(source.height / STRIP) + Math.ceil(source.width / STRIP) },
        () =>
          admit(UNIFORM_BYTES, () =>
            device.createBuffer({ size: UNIFORM_BYTES, usage: 0x08 | 0x40 })
          )
      );
      return {
        width: source.width,
        height: source.height,
        horizontal,
        result,
        moments,
        uniforms,
        resources,
      };
    } catch (error) {
      for (const { resource, reservation } of resources) {
        resource.destroy();
        reservation.release();
      }
      throw error;
    }
  };
  const clear = () => {
    for (const [key, entry] of entries) release(key, entry);
    prepared.clear();
    used.clear();
  };
  return {
    get allocatedBytes() {
      return allocatedBytes;
    },
    beginFrame() {
      if (disposed || active) throw new Error('GPU CSS filter frame is unavailable.');
      active = true;
      prepared.clear();
      used.clear();
    },
    prepare(
      encoder: GPUCommandEncoder,
      source: GPUTexture,
      key: string,
      settings: Settings
    ): GPUTexture {
      if (disposed || !active) throw new Error('GPU CSS filter frame is unavailable.');
      const sigma = settings.blur ?? 0;
      const brightness = settings.brightness ?? 1;
      const saturation = settings.saturate ?? 1;
      if (![sigma, brightness, saturation].every((value) => Number.isFinite(value) && value >= 0))
        throw new Error('GPU CSS filter settings are unavailable.');
      const signature = `${sigma}:${brightness}:${saturation}`;
      const previous = prepared.get(key);
      let entry = entries.get(key);
      if (previous) {
        if (previous.source !== source || previous.settings !== signature || !entry)
          throw new Error('GPU CSS filter key has conflicting sources.');
        return entry.result;
      }
      if (entry && (entry.width !== source.width || entry.height !== source.height)) {
        release(key, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = allocate(source);
        entries.set(key, entry);
      }
      used.add(key);
      // Beyond this sigma the maximal two-dimensional box-kernel alpha is below half an RGBA8 step.
      const empty = sigma > Math.max(source.width, source.height) * 512;
      const boxes = empty ? [1, 1, 1] : gpuPreviewCssKernel(sigma);
      const radius = (boxes.reduce((sum, width) => sum + width, 0) - 3) / 2;
      let slot = 0;
      for (const axis of [0, 1]) {
        const input = axis === 0 ? source : entry.horizontal;
        const output = axis === 0 ? entry.horizontal : entry.result;
        const lines = axis === 0 ? source.height : source.width;
        const length = axis === 0 ? source.width : source.height;
        for (let base = 0; base < lines; base += STRIP) {
          const uniform = entry.uniforms[slot++];
          if (!uniform) throw new Error('GPU CSS filter uniform is unavailable.');
          const data = new ArrayBuffer(UNIFORM_BYTES);
          new Uint32Array(data, 0, 8).set([
            source.width,
            source.height,
            axis,
            base,
            boxes[0]!,
            boxes[1]!,
            boxes[2]!,
            radius,
          ]);
          new Float32Array(data, 32, 2).set([
            Math.min(brightness, 3e38),
            Math.min(saturation, 3e38),
          ]);
          new Uint32Array(data, 40, 2).set([empty ? 1 : 0, 0]);
          device.queue.writeBuffer(uniform, 0, data);
          const stages: GPUComputePipeline[] =
            radius > 24 && !empty ? [prefixPipeline, outputPipeline] : [outputPipeline];
          for (const pipeline of stages) {
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(
              0,
              device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: { buffer: uniform } },
                  { binding: 1, resource: input.createView() },
                  ...(pipeline === prefixPipeline
                    ? [{ binding: 2, resource: { buffer: entry.moments } }]
                    : [
                        { binding: 2, resource: { buffer: entry.moments } },
                        { binding: 3, resource: output.createView() },
                      ]),
                ],
              })
            );
            if (pipeline === prefixPipeline) pass.dispatchWorkgroups(Math.min(STRIP, lines - base));
            else pass.dispatchWorkgroups(Math.ceil(length / 64), Math.min(STRIP, lines - base));
            pass.end();
          }
        }
      }
      prepared.set(key, { source, settings: signature });
      return entry.result;
    },
    endFrame() {
      if (!active) return;
      active = false;
      if (disposed) clear();
      else for (const [key, entry] of entries) if (!used.has(key)) release(key, entry);
      prepared.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!active) clear();
    },
  };
}
