/**
 * @id sniptale/js/sensitive-retention-outside-owner
 * @name Sensitive retention outside approved owner
 * @description Flags browser storage writes that retain prompt/content-bearing payloads outside approved policy owners.
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
  isSensitiveRetentionFieldName(fieldName) and
  not isAllowedSensitiveRetentionOwner(call.getFile())
select
  property,
  "Persists prompt/content-bearing field '" + fieldName +
    "' through browser storage outside the approved policy owners."
