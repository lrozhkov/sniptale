import type { ExportHarStartPreauthorization } from '../start-capability';

const preauthorizedHarStartMessages = new WeakMap<object, ExportHarStartPreauthorization>();
const preauthorizedHarStopMessages = new WeakSet<object>();

export function markPreauthorizedHarStartRouteMessage(
  message: object,
  preauthorization: ExportHarStartPreauthorization
): void {
  preauthorizedHarStartMessages.set(message, preauthorization);
}

export function markPreauthorizedHarStopRouteMessage(message: object): void {
  preauthorizedHarStopMessages.add(message);
}

export function hasPreauthorizedHarStartRouteMessage(message: object): boolean {
  return preauthorizedHarStartMessages.has(message);
}

export function getPreauthorizedHarStartRouteMessage(
  message: object
): ExportHarStartPreauthorization | undefined {
  return preauthorizedHarStartMessages.get(message);
}

export function hasPreauthorizedHarStopRouteMessage(message: object): boolean {
  return preauthorizedHarStopMessages.has(message);
}
