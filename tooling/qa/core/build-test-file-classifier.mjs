const BUILD_TEST_FILE_PATTERN =
  /(?:^|\/)(?:__tests__|__fixtures__|test|test-support|fixtures)(?:\/|$)|(?:^|\/)(?:test-support|test-helpers|fixtures)\.[cm]?[jt]sx?$|\.(?:test|spec|test-support|test\.helpers|test\.fixtures|fixtures)\.[cm]?[jt]sx?$/u;

export function isBuildTestFile(file) {
  return BUILD_TEST_FILE_PATTERN.test(file);
}
