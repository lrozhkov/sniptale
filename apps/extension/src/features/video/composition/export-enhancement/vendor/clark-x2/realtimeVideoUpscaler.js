/*! @license Modified by Sniptale.
 * Add a read-only unavailable getter and initialization failure cleanup.
 * Qualify browser globals with globalThis.
 * See NOTICE.txt and LICENSE for provenance and license terms.
 */
import { requestBestWebGpuAdapter } from "./runtimeCapabilities.js";

export const REALTIME_VIDEO_MODEL = Object.freeze({
  blocks: 3,
  bytes: 16992,
  channels: 12,
  colorMode: "rgb",
  id: "clark-realtime-ui-video-x2",
  scale: 2,
  sha256: "c6b4f22d8c38270225b809e97d233eb68d7a48eef17595ac17a60b4540c72dce",
  url: "/models/clark-realtime-ui-video-x2/model.bin?v=c6b4f22d",
});

export function realtimeVideoIsEligible({ enabled = true, height, kind, width }) {
  return Boolean(
    enabled
    && kind === "video"
    && Number(width) >= 64
    && Number(height) >= 64
    && width <= 1920
    && height <= 1080
    && width % 2 === 0
    && height % 2 === 0
  );
}

async function digestHex(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function loadModel(model) {
  const response = await fetch(model.url, { cache: "force-cache" });
  if (!response.ok) throw new Error("Realtime video model download failed");
  const payload = await response.arrayBuffer();
  if (payload.byteLength !== model.bytes) {
    throw new Error("Realtime video model size check failed");
  }
  const hash = await digestHex(payload);
  if (hash && hash !== model.sha256) {
    throw new Error("Realtime video model identity check failed");
  }
  return payload;
}

function mappedBuffer(device, values, usage) {
  const bytes = values instanceof ArrayBuffer
    ? new Uint8Array(values)
    : new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  const buffer = device.createBuffer({
    mappedAtCreation: true,
    size: Math.ceil(bytes.byteLength / 4) * 4,
    usage,
  });
  new Uint8Array(buffer.getMappedRange()).set(bytes);
  buffer.unmap();
  return buffer;
}

function modelBuffer(device, payload, offset, bytes) {
  return mappedBuffer(
    device,
    new Uint8Array(payload, offset, bytes),
    globalThis.GPUBufferUsage.STORAGE | globalThis.GPUBufferUsage.COPY_DST,
  );
}

async function compiledModule(device, code) {
  const module = device.createShaderModule({ code });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === "error");
  if (errors.length) throw new Error(errors.map((message) => message.message).join("\n"));
  return module;
}

function inputShader() {
  return /* wgsl */ `
    enable f16;
    struct Dimensions { width: u32, height: u32, channels: u32, padding: u32 }
    @group(0) @binding(0) var source: texture_external;
    @group(0) @binding(1) var source_sampler: sampler;
    @group(0) @binding(2) var<storage, read_write> output: array<f16>;
    @group(0) @binding(3) var<storage, read> weights: array<f16>;
    @group(0) @binding(4) var<uniform> dimensions: Dimensions;

    @compute @workgroup_size(8, 8, 1)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
      if (id.x >= dimensions.width || id.y >= dimensions.height) { return; }
      let source_size = vec2<f32>(f32(dimensions.width * 2u), f32(dimensions.height * 2u));
      let base = vec2<f32>(f32(id.x * 2u), f32(id.y * 2u));
      let p0 = textureSampleBaseClampToEdge(source, source_sampler, (base + vec2<f32>(0.5, 0.5)) / source_size).rgb;
      let p1 = textureSampleBaseClampToEdge(source, source_sampler, (base + vec2<f32>(1.5, 0.5)) / source_size).rgb;
      let p2 = textureSampleBaseClampToEdge(source, source_sampler, (base + vec2<f32>(0.5, 1.5)) / source_size).rgb;
      let p3 = textureSampleBaseClampToEdge(source, source_sampler, (base + vec2<f32>(1.5, 1.5)) / source_size).rgb;
      let pixels = array<f32, 12>(
        p0.r, p1.r, p2.r, p3.r,
        p0.g, p1.g, p2.g, p3.g,
        p0.b, p1.b, p2.b, p3.b,
      );
      for (var channel = 0u; channel < dimensions.channels; channel += 1u) {
        let offset = channel * 12u;
        var value = 0.0;
        for (var input_channel = 0u; input_channel < 12u; input_channel += 1u) {
          value += pixels[input_channel] * f32(weights[offset + input_channel]);
        }
        output[(id.y * dimensions.width + id.x) * dimensions.channels + channel] = f16(max(value, 0.0));
      }
    }
  `;
}

function fusedShader(channels) {
  const tile = 8;
  const inputTile = tile + 4;
  const intermediateTile = tile + 2;
  const inputElements = inputTile * inputTile * channels;
  const intermediateElements = intermediateTile * intermediateTile * channels;
  const weightElements = 9 * channels * channels;
  return /* wgsl */ `
    enable f16;
    struct Dimensions { width: u32, height: u32, channels: u32, padding: u32 }
    @group(0) @binding(0) var<storage, read> input: array<f16>;
    @group(0) @binding(1) var<storage, read> weights: array<f16>;
    @group(0) @binding(2) var<storage, read_write> output: array<f16>;
    @group(0) @binding(3) var<uniform> dimensions: Dimensions;
    var<workgroup> input_tile: array<f16, ${inputElements}>;
    var<workgroup> intermediate_tile: array<f16, ${intermediateElements}>;

    fn input_index(x: u32, y: u32, channel: u32) -> u32 {
      return (y * ${inputTile}u + x) * ${channels}u + channel;
    }
    fn intermediate_index(x: u32, y: u32, channel: u32) -> u32 {
      return (y * ${intermediateTile}u + x) * ${channels}u + channel;
    }
    fn weight_index(output_channel: u32, kernel_x: u32, kernel_y: u32, input_channel: u32) -> u32 {
      return ((output_channel * 3u + kernel_y) * 3u + kernel_x) * ${channels}u + input_channel;
    }

    @compute @workgroup_size(${tile}, ${tile}, 1)
    fn main(
      @builtin(workgroup_id) group: vec3<u32>,
      @builtin(local_invocation_index) lane: u32,
      @builtin(local_invocation_id) local: vec3<u32>,
    ) {
      let base_x = i32(group.x * ${tile}u);
      let base_y = i32(group.y * ${tile}u);
      for (var linear = lane; linear < ${inputElements}u; linear += ${tile * tile}u) {
        let channel = linear % ${channels}u;
        let pixel = linear / ${channels}u;
        let tile_x = pixel % ${inputTile}u;
        let tile_y = pixel / ${inputTile}u;
        let source_x = base_x + i32(tile_x) - 2;
        let source_y = base_y + i32(tile_y) - 2;
        let inside = source_x >= 0 && source_y >= 0
          && source_x < i32(dimensions.width) && source_y < i32(dimensions.height);
        var value = 0.0h;
        if (inside) {
          value = input[(u32(source_y) * dimensions.width + u32(source_x)) * ${channels}u + channel];
        }
        input_tile[linear] = value;
      }
      workgroupBarrier();

      for (var linear = lane; linear < ${intermediateElements}u; linear += ${tile * tile}u) {
        let output_channel = linear % ${channels}u;
        let pixel = linear / ${channels}u;
        let tile_x = pixel % ${intermediateTile}u;
        let tile_y = pixel / ${intermediateTile}u;
        let output_x = base_x + i32(tile_x) - 1;
        let output_y = base_y + i32(tile_y) - 1;
        var sum = 0.0h;
        if (output_x >= 0 && output_y >= 0
          && output_x < i32(dimensions.width) && output_y < i32(dimensions.height)) {
          for (var kernel_y = 0u; kernel_y < 3u; kernel_y += 1u) {
            for (var kernel_x = 0u; kernel_x < 3u; kernel_x += 1u) {
              for (var input_channel = 0u; input_channel < ${channels}u; input_channel += 1u) {
                sum += input_tile[input_index(tile_x + kernel_x, tile_y + kernel_y, input_channel)]
                  * weights[weight_index(output_channel, kernel_x, kernel_y, input_channel)];
              }
            }
          }
        }
        intermediate_tile[linear] = max(sum, 0.0h);
      }
      workgroupBarrier();

      let output_x = group.x * ${tile}u + local.x;
      let output_y = group.y * ${tile}u + local.y;
      if (output_x >= dimensions.width || output_y >= dimensions.height) { return; }
      for (var output_channel = 0u; output_channel < ${channels}u; output_channel += 1u) {
        var sum = 0.0h;
        for (var kernel_y = 0u; kernel_y < 3u; kernel_y += 1u) {
          for (var kernel_x = 0u; kernel_x < 3u; kernel_x += 1u) {
            for (var input_channel = 0u; input_channel < ${channels}u; input_channel += 1u) {
              sum += intermediate_tile[intermediate_index(local.x + kernel_x, local.y + kernel_y, input_channel)]
                * weights[${weightElements}u + weight_index(output_channel, kernel_x, kernel_y, input_channel)];
            }
          }
        }
        let residual = input_tile[input_index(local.x + 2u, local.y + 2u, output_channel)];
        output[(output_y * dimensions.width + output_x) * ${channels}u + output_channel] = max(sum + residual, 0.0h);
      }
    }
  `;
}

function outputShader() {
  return /* wgsl */ `
    enable f16;
    struct Dimensions { width: u32, height: u32, channels: u32, padding: u32 }
    @group(0) @binding(0) var source: texture_external;
    @group(0) @binding(1) var source_sampler: sampler;
    @group(0) @binding(2) var<storage, read> features: array<f16>;
    @group(0) @binding(3) var<storage, read> weights: array<f16>;
    @group(0) @binding(4) var<uniform> dimensions: Dimensions;

    @vertex
    fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
      let position = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0)
      );
      return vec4<f32>(position[index], 0.0, 1.0);
    }

    @fragment
    fn fragment_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
      let output_pixel = vec2<u32>(position.xy);
      let work_pixel = output_pixel / 4u;
      let subpixel = (output_pixel.y % 4u) * 4u + output_pixel.x % 4u;
      let feature_offset = (work_pixel.y * dimensions.width + work_pixel.x) * dimensions.channels;
      var residual = vec3<f32>(0.0);
      for (var color_channel = 0u; color_channel < 3u; color_channel += 1u) {
        let weight_offset = (color_channel * 16u + subpixel) * dimensions.channels;
        var correction = 0.0;
        for (var channel = 0u; channel < dimensions.channels; channel += 1u) {
          correction += f32(features[feature_offset + channel]) * f32(weights[weight_offset + channel]);
        }
        residual[color_channel] = correction;
      }
      let output_size = vec2<f32>(f32(dimensions.width * 4u), f32(dimensions.height * 4u));
      let base = textureSampleBaseClampToEdge(source, source_sampler, position.xy / output_size).rgb;
      return vec4<f32>(clamp(base + residual, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
    }
  `;
}

export async function createRealtimeVideoUpscaler({
  height,
  model = REALTIME_VIDEO_MODEL,
  width,
}) {
  if (!realtimeVideoIsEligible({ enabled: true, height, kind: "video", width })) return null;
  const result = await requestBestWebGpuAdapter(globalThis.navigator?.gpu);
  if (!result.adapter?.features?.has("shader-f16")) return null;
  const device = await result.adapter.requestDevice({ requiredFeatures: ["shader-f16"] });
  try {
  const contextCanvas = globalThis.document.createElement("canvas");
  contextCanvas.width = width * model.scale;
  contextCanvas.height = height * model.scale;
  const context = contextCanvas.getContext("webgpu");
  if (!context) {
    device.destroy?.();
    return null;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const payload = await loadModel(model);
  const workWidth = width / 2;
  const workHeight = height / 2;
  const channels = model.channels;
  const featureBytes = workWidth * workHeight * channels * 2;
  const featureUsage = globalThis.GPUBufferUsage.STORAGE | globalThis.GPUBufferUsage.COPY_DST;
  const first = device.createBuffer({ size: featureBytes, usage: featureUsage });
  const second = device.createBuffer({ size: featureBytes, usage: featureUsage });
  const dimensions = mappedBuffer(
    device,
    new Uint32Array([workWidth, workHeight, channels, 0]),
    globalThis.GPUBufferUsage.UNIFORM | globalThis.GPUBufferUsage.COPY_DST,
  );
  const inputWeights = modelBuffer(device, payload, 0, 288);
  const blockWeights = [
    modelBuffer(device, payload, 288, 5184),
    modelBuffer(device, payload, 5472, 5184),
    modelBuffer(device, payload, 10656, 5184),
  ];
  const outputWeights = modelBuffer(device, payload, 15840, 1152);
  const [inputModule, convolutionModule, outputModule] = await Promise.all([
    compiledModule(device, inputShader()),
    compiledModule(device, fusedShader(channels)),
    compiledModule(device, outputShader()),
  ]);
  const inputPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: inputModule, entryPoint: "main" },
  });
  const convolutionPipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: convolutionModule, entryPoint: "main" },
  });
  const outputPipeline = await device.createRenderPipelineAsync({
    layout: "auto",
    vertex: { module: outputModule, entryPoint: "vertex_main" },
    fragment: { module: outputModule, entryPoint: "fragment_main", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const convolutionGroups = blockWeights.map((weights, stage) => {
    const source = stage & 1 ? second : first;
    const target = stage & 1 ? first : second;
    return device.createBindGroup({
      layout: convolutionPipeline.getBindGroupLayout(0),
      entries: [source, weights, target, dimensions].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
  });
  let busy = false;
  let destroyed = false;
  let ready = false;
  device.lost.then(() => { destroyed = true; }).catch(() => { destroyed = true; });

  return {
    backend: "webgpu-f16",
    canvas: contextCanvas,
    get ready() { return ready; },
    get unavailable() { return destroyed; },
    destroy() {
      destroyed = true;
      for (const buffer of [first, second, dimensions, inputWeights, outputWeights, ...blockWeights]) {
        buffer.destroy?.();
      }
      device.destroy?.();
    },
    async enhance(source) {
      if (busy || destroyed || !source) return ready ? contextCanvas : null;
      busy = true;
      try {
        const external = device.importExternalTexture({ source });
        const inputGroup = device.createBindGroup({
          layout: inputPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: external },
            { binding: 1, resource: sampler },
            { binding: 2, resource: { buffer: first } },
            { binding: 3, resource: { buffer: inputWeights } },
            { binding: 4, resource: { buffer: dimensions } },
          ],
        });
        const outputGroup = device.createBindGroup({
          layout: outputPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: external },
            { binding: 1, resource: sampler },
            { binding: 2, resource: { buffer: second } },
            { binding: 3, resource: { buffer: outputWeights } },
            { binding: 4, resource: { buffer: dimensions } },
          ],
        });
        const command = device.createCommandEncoder();
        const compute = command.beginComputePass();
        compute.setPipeline(inputPipeline);
        compute.setBindGroup(0, inputGroup);
        compute.dispatchWorkgroups(Math.ceil(workWidth / 8), Math.ceil(workHeight / 8));
        compute.setPipeline(convolutionPipeline);
        for (const group of convolutionGroups) {
          compute.setBindGroup(0, group);
          compute.dispatchWorkgroups(Math.ceil(workWidth / 8), Math.ceil(workHeight / 8));
        }
        compute.end();
        const render = command.beginRenderPass({
          colorAttachments: [{
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
            view: context.getCurrentTexture().createView(),
          }],
        });
        render.setPipeline(outputPipeline);
        render.setBindGroup(0, outputGroup);
        render.draw(3);
        render.end();
        device.queue.submit([command.finish()]);
        await device.queue.onSubmittedWorkDone();
        ready = true;
        return contextCanvas;
      } finally {
        busy = false;
      }
    },
  };
  } catch (error) {
    device.destroy?.();
    throw error;
  }
}
