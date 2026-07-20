import fs from 'node:fs';

import {
  collectLineViolations,
  createViolation,
  hasAnyLine,
  lineNumber,
  normalizePath,
} from './audit-guardrail-shared.mjs';
import { HOT_LOOP_MESSAGE, HOT_LOOP_PREFIXES } from './audit-guardrail-resource-owners.mjs';

function isResourceLifecycleTarget(relativePath) {
  const isRuntimeOwner =
    relativePath.startsWith('apps/extension/src/background/') ||
    relativePath.startsWith('apps/extension/src/offscreen/');
  return (
    isRuntimeOwner && /(?:recording|export|debugger|media|video|capture).*\.ts$/u.test(relativePath)
  );
}

function isHotLoopTarget(relativePath) {
  return HOT_LOOP_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

export function collectResourceBudgetConsistencyViolations(files) {
  const relativeFiles = files.map(normalizePath);
  const sourceByFile = new Map(
    files.map((file, index) => [relativeFiles[index], fs.readFileSync(file, 'utf8')])
  );
  const contentLimits = sourceByFile.get(
    'apps/extension/src/content/parser/web-snapshot/limits.ts'
  );
  const stagedBlobs = sourceByFile.get(
    'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.ts'
  );
  const llmLimits = sourceByFile.get('apps/extension/src/background/ai/llm/payload-limits.ts');
  const violations = [];

  if (contentLimits && stagedBlobs) {
    const blobMatch = contentLimits.match(/MAX_WEB_SNAPSHOT_PACKAGE_BLOB_BYTES\s*=\s*(\d+)/u);
    const stagedMatch = stagedBlobs.match(/MAX_PACKAGE_BYTES\s*=\s*(\d+)/u);
    if (blobMatch && stagedMatch && Number(stagedMatch[1]) < Number(blobMatch[1])) {
      violations.push(
        createViolation(
          'resource-budget-ordering',
          'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.ts',
          1,
          'Runtime staged package budget must be at least the content compressed blob budget envelope.'
        )
      );
    }
  }

  const hasCharacterOnlyBudget =
    llmLimits &&
    /MAX_\w+_CHARS/u.test(llmLimits) &&
    !/DecodedBytes|decodedBytes|byteLength/u.test(llmLimits);
  if (hasCharacterOnlyBudget) {
    violations.push(
      createViolation(
        'resource-budget-character-only',
        'apps/extension/src/background/ai/llm/payload-limits.ts',
        1,
        'LLM/scenario runtime payload budgets should use byte/decoded attachment limits, not only character counts.'
      )
    );
  }

  return violations;
}

export function collectResourceLifecyclePairViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!isResourceLifecycleTarget(relativePath)) {
      return [];
    }
    const violations = [];
    if (source.includes('URL.createObjectURL') && !source.includes('URL.revokeObjectURL')) {
      violations.push(
        createViolation(
          'resource-lifecycle-object-url',
          relativePath,
          lines.findIndex((line) => line.includes('URL.createObjectURL')) + 1,
          'Object URLs must have an owned revoke path in the same lifecycle owner.'
        )
      );
    }
    const attachesDebugger =
      /chrome\.debugger\.attach|browserDebugger\.attach|debugger\.attach/u.test(source);
    if (attachesDebugger && !/\bdetach\b/u.test(source)) {
      violations.push(
        createViolation(
          'resource-lifecycle-debugger-detach',
          relativePath,
          1,
          'Debugger attach owners must have detach on abort/failure cleanup paths.'
        )
      );
    }
    if (source.includes('new MediaRecorder') && !source.includes('.onerror')) {
      violations.push(
        createViolation(
          'resource-lifecycle-recorder-error',
          relativePath,
          lines.findIndex((line) => line.includes('new MediaRecorder')) + 1,
          'MediaRecorder owners must handle terminal onerror cleanup.'
        )
      );
    }
    return violations;
  });
}

export function collectHotLoopWorkViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!isHotLoopTarget(relativePath)) {
      return [];
    }
    const hasHotLoop =
      /\b(?:for\s*\(|while\s*\(|requestAnimationFrame|renderFrame|currentTime|frameIndex)\b/u.test(
        source
      ) ||
      /\b(?:cursor|timelinePreview)\b/u.test(source) ||
      /project-echo/u.test(relativePath);
    if (!hasHotLoop) {
      return [];
    }
    return lines.flatMap((line, index) => {
      const isPerFrameCollectionWork =
        /(?:frame|render|timeline|cursor)/u.test(relativePath) &&
        /\.(?:sort|filter)\s*\(/u.test(line);
      const isFullProjectEcho = /JSON\.stringify\s*\(\s*project\s*\)/u.test(line);
      const isRepeatedPackageGeneration = /\.generateAsync\s*\(/u.test(line);
      if (!isPerFrameCollectionWork && !isFullProjectEcho && !isRepeatedPackageGeneration) {
        return [];
      }
      return [
        createViolation(
          'hot-loop-expensive-work',
          relativePath,
          lineNumber(index),
          HOT_LOOP_MESSAGE
        ),
      ];
    });
  });
}

export function collectStatsCounterSemanticsViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!/manifest|web-snapshot|package/u.test(relativePath) || !source.includes('warningCount')) {
      return [];
    }
    return lines.flatMap((line, index) => {
      const mixesFailureIntoWarning = /warningCount\s*[:=][^;\n]*(?:failed|error|skipped)/iu.test(
        line
      );
      const hasSemanticCounter = hasAnyLine(lines, /\b(?:failedAssetCount|networkWarningCount)\b/u);
      if (!mixesFailureIntoWarning || hasSemanticCounter) {
        return [];
      }
      return [
        createViolation(
          'stats-counter-semantics',
          relativePath,
          lineNumber(index),
          'Manifest stats should keep warning, failed, skipped, and network counters semantically separate.'
        ),
      ];
    });
  });
}
