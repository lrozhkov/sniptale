/**
 * @id sniptale/js/parser-snapshot-purity
 * @name Parser/export seam reads live DOM or location
 * @description Flags parser and export seams that reach into live DOM/location state instead of snapshot or IR data.
 * @kind problem
 * @problem.severity warning
 * @precision high
 * @tags maintainability
 *       architecture
 */

import javascript
import lib.SniptaleOwnership

predicate isDisallowedParserAccess(PropAccess access) {
  access.getQualifiedName() =
    [
      "document.querySelector",
      "document.querySelectorAll",
      "document.getElementById",
      "document.title",
      "document.body",
      "document.documentElement",
      "window.location",
      "location.href",
      "location.pathname",
      "location.hostname",
      "location.origin"
    ]
}

from PropAccess access
where
  isParserSnapshotSeam(access.getFile()) and
  not isAllowedParserSnapshotBoundaryOwner(access.getFile()) and
  isDisallowedParserAccess(access)
select
  access,
  "Parser/export seams must use snapshot, page-profile, or IR data instead of live DOM/location access."
