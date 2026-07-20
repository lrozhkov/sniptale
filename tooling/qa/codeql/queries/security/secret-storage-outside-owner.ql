/**
 * @id sniptale/js/secret-storage-outside-owner
 * @name Secret-like browser storage writes outside approved owner
 * @description Flags browser storage writes that persist secret-like fields outside the approved encrypted secret-owner seam.
 * @kind problem
 * @problem.severity warning
 * @precision high
 * @tags security
 *       external/cwe/cwe-922
 */

import javascript
import lib.SniptaleOwnership

from CallExpr call, ObjectExpr storedObject, Property property, string fieldName
where
  isStorageWriteCall(call, _) and
  storedObject = call.getArgument(0) and
  property = storedObject.getAProperty() and
  fieldName = property.getName() and
  isSecretLikeFieldName(fieldName) and
  not isAllowedSecretStorageOwner(call.getFile())
select
  property,
  "Persists secret-like field '" + fieldName +
    "' through browser storage outside the approved encrypted secret owner."
