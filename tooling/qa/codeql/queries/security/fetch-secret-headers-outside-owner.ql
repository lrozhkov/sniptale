/**
 * @id sniptale/js/fetch-secret-headers-outside-owner
 * @name Secret-bearing request headers outside approved transport owner
 * @description Flags inline request/header assembly with secret-bearing headers outside the approved transport seam.
 * @kind problem
 * @problem.severity warning
 * @precision medium
 * @tags security
 *       external/cwe/cwe-201
 */

import javascript
import lib.SniptaleOwnership

predicate isSecretBearingHeaderName(string headerName) {
  headerName = ["Authorization", "authorization", "Cookie", "cookie", "X-API-Key", "x-api-key"]
}

from CallExpr call, ObjectExpr requestOptions, ObjectExpr headersObject, Property header, string headerName
where
  hasObjectArgument(call, requestOptions) and
  hasObjectPropertyNamed(requestOptions, "headers", headersObject) and
  header = headersObject.getAProperty() and
  headerName = header.getName() and
  isSecretBearingHeaderName(headerName) and
  not isAllowedSecretHeaderOwner(call.getFile())
select
  header,
  "Assembles secret-bearing request header '" + headerName +
    "' outside the approved network transport owner."
