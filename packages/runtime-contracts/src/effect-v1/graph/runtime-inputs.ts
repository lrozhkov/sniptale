import { type EffectV1DiagnosticReporter, isRecord } from '../validation/shared.js';

export function validateRequiredRuntimeInputs(
  commands: unknown[],
  requiredInputs: Set<string>,
  report: EffectV1DiagnosticReporter
): void {
  if (requiredInputs.size === 0) return;
  const used = new Set<string>();
  collectRuntimeInputs(commands, used);
  for (const input of requiredInputs) {
    if (used.has(input)) continue;
    report.error(
      'RUNTIME_INPUT_REQUIRED',
      '$.program.commands',
      `Effect kind requires runtime input "${input}", but the graph never reads it.`,
      `Add an image command with input: "${input}". Preview media remains session-only and is not part of the bundle.`
    );
  }
}

function collectRuntimeInputs(commands: unknown[], used: Set<string>): void {
  for (const value of commands) {
    if (!isRecord(value)) continue;
    if (value['op'] === 'image' && typeof value['input'] === 'string') used.add(value['input']);
    if (Array.isArray(value['commands'])) collectRuntimeInputs(value['commands'], used);
  }
}
