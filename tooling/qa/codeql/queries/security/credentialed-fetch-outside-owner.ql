/**
 * @id sniptale/js/credentialed-fetch-outside-owner
 * @name Credentialed request outside approved owner
 * @description Flags inline request options that set credentials to include outside approved owners.
 * @kind problem
 * @problem.severity warning
 * @precision medium
 * @tags security
 *       external/cwe/cwe-200
 */

import javascript
import lib.SniptaleOwnership

from CallExpr call, ObjectExpr requestOptions, Property credentialsProperty
where
  hasObjectArgument(call, requestOptions) and
  hasPropertyNamed(requestOptions, "credentials", credentialsProperty) and
  credentialsProperty.getInit().getStringValue() = "include" and
  not isAllowedCredentialedFetchOwner(call.getFile())
select
  credentialsProperty,
  "Assembles a credentialed request outside the approved same-origin export/network owners."
