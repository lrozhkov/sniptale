const ADAPTER_ATTEMPTS = [
  { mode: "default" },
  { mode: "high-performance", options: { powerPreference: "high-performance" } },
  { mode: "low-power", options: { powerPreference: "low-power" } },
  { mode: "compatibility", options: { featureLevel: "compatibility" } },
  {
    mode: "compatibility-low-power",
    options: { featureLevel: "compatibility", powerPreference: "low-power" },
  },
  {
    mode: "software-fallback",
    options: { featureLevel: "compatibility", forceFallbackAdapter: true },
  },
];

let computeCapabilityPromise;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function requestBestWebGpuAdapter(gpu) {
  if (typeof gpu?.requestAdapter !== "function") {
    return { adapter: null, attempts: [], mode: null, reason: "api-unavailable" };
  }

  const attempts = [];
  for (const attempt of ADAPTER_ATTEMPTS) {
    let adapter;
    try {
      adapter = await gpu.requestAdapter(attempt.options);
      if (!adapter) {
        attempts.push({ mode: attempt.mode, result: "no-adapter" });
        continue;
      }
      const device = await adapter.requestDevice();
      device.destroy?.();
      const readyAdapter = await gpu.requestAdapter(attempt.options);
      if (!readyAdapter) {
        attempts.push({ mode: attempt.mode, result: "adapter-refresh-failed" });
        continue;
      }
      attempts.push({ mode: attempt.mode, result: "ready" });
      return { adapter: readyAdapter, attempts, mode: attempt.mode, reason: "ready" };
    } catch (error) {
      attempts.push({
        message: errorMessage(error),
        mode: attempt.mode,
        result: adapter ? "device-failed" : "adapter-failed",
      });
    }
  }

  const reason = attempts.some((attempt) => attempt.result === "device-failed")
    ? "device-unavailable"
    : "adapter-unavailable";
  return { adapter: null, attempts, mode: null, reason };
}

export async function probeComputeCapability({
  gpu = globalThis.navigator?.gpu,
  secureContext = globalThis.isSecureContext,
} = {}) {
  if (secureContext === false) {
    return {
      backend: "wasm",
      label: "CPU optimized",
      mode: null,
      reason: "insecure-context",
      webGpu: false,
    };
  }

  const result = await requestBestWebGpuAdapter(gpu);
  return {
    backend: result.adapter ? "webgpu" : "wasm",
    label: result.adapter ? "GPU accelerated" : "CPU optimized",
    mode: result.mode,
    reason: result.reason,
    webGpu: Boolean(result.adapter),
  };
}

export function getComputeCapability() {
  if (!computeCapabilityPromise) {
    computeCapabilityPromise = probeComputeCapability().catch((error) => {
      console.warn("Local GPU probe failed; continuing with browser CPU.", error);
      return {
        backend: "wasm",
        label: "CPU optimized",
        mode: null,
        reason: "probe-error",
        webGpu: false,
      };
    });
  }
  return computeCapabilityPromise;
}

export async function hasWebGpuAdapter() {
  return (await getComputeCapability()).webGpu;
}

export function resetComputeCapability() {
  computeCapabilityPromise = undefined;
}
