import { runtimeInfo } from '@sniptale/platform/browser/runtime';

type NativeAppChannel = 'stable' | 'beta' | 'dev';

const HOST_NAMES: Record<NativeAppChannel, string> = {
  beta: 'com.sniptale.beta.native_host',
  dev: 'com.sniptale.dev.native_host',
  stable: 'com.sniptale.native_host',
};

export function resolveNativeAppChannel(): NativeAppChannel {
  const manifest = runtimeInfo.getManifest();
  const versionName = manifest.version_name ?? manifest.version ?? '';
  const name = manifest.name ?? '';
  if (/\bdev\b|local|unpacked/i.test(`${name} ${versionName}`)) {
    return 'dev';
  }
  if (/\bbeta\b/i.test(`${name} ${versionName}`)) {
    return 'beta';
  }
  return 'stable';
}

export function resolveNativeHostName(channel = resolveNativeAppChannel()): string {
  return HOST_NAMES[channel];
}
