import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../core/shared.mjs';
import { resolveRepositoryWritePath } from '../policy/repository-contained-paths.mjs';
import {
  collectSensitiveEnvironmentValues,
  sanitizeLogText,
} from '../runtime/observability/sanitize.mjs';

export function resolveAuditReportPath(reportPath, { root = repoRoot } = {}) {
  return path.isAbsolute(reportPath) ? reportPath : path.join(root, reportPath);
}

export function prepareAuditReportPath(absoluteReportPath) {
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  fs.rmSync(absoluteReportPath, { force: true });
}

function sanitizeReportValue(value, options) {
  if (typeof value === 'string') return sanitizeLogText(value, options);
  if (Array.isArray(value)) return value.map((entry) => sanitizeReportValue(entry, options));
  if (value && typeof value === 'object') {
    const sanitized = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      const sanitizedKey = sanitizeLogText(key, options);
      if (Object.hasOwn(sanitized, sanitizedKey)) {
        throw new Error(`Sanitized audit report key collision: ${JSON.stringify(sanitizedKey)}`);
      }
      sanitized[sanitizedKey] = sanitizeReportValue(entry, options);
    }
    return sanitized;
  }
  return value;
}

export function prepareSanitizedAuditReportPath(reportPath, { root = repoRoot } = {}) {
  let absoluteReportPath = resolveRepositoryWritePath(root, reportPath);
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  absoluteReportPath = resolveRepositoryWritePath(root, reportPath);
  fs.rmSync(absoluteReportPath, { force: true });
  return absoluteReportPath;
}

export function writeSanitizedAuditReport(
  reportPath,
  value,
  { root = repoRoot, sensitiveValues = collectSensitiveEnvironmentValues() } = {}
) {
  const absoluteReportPath = prepareSanitizedAuditReportPath(reportPath, { root });
  const sanitized = sanitizeReportValue(value, {
    repositoryRoot: root,
    sensitiveValues,
  });
  const temporaryReportPath = `${reportPath}.${process.pid}.${randomUUID()}.tmp`;
  const absoluteTemporaryPath = resolveRepositoryWritePath(root, temporaryReportPath);
  try {
    fs.writeFileSync(absoluteTemporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    const verifiedFinalPath = resolveRepositoryWritePath(root, reportPath);
    const verifiedTemporaryPath = resolveRepositoryWritePath(root, temporaryReportPath);
    fs.renameSync(verifiedTemporaryPath, verifiedFinalPath);
  } finally {
    fs.rmSync(absoluteTemporaryPath, { force: true });
  }
  return absoluteReportPath;
}
