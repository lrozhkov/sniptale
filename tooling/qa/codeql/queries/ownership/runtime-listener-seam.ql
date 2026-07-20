/**
 * @id sniptale/js/runtime-listener-seam
 * @name Runtime listener registration outside sanctioned seam
 * @description Flags direct chrome.runtime.onMessage listener registration outside explicit runtime boundary owners.
 * @kind problem
 * @problem.severity warning
 * @precision high
 * @tags maintainability
 *       architecture
 */

import javascript

from CallExpr call, PropAccess callee, string qualifiedName
where
  callee = call.getCallee() and
  qualifiedName = callee.getQualifiedName() and
  qualifiedName = ["chrome.runtime.onMessage.addListener", "chrome.runtime.onMessage.removeListener"]
select
  call,
  "Register chrome.runtime.onMessage listeners only in explicit boundary-owner files or sanctioned runtime seams."
