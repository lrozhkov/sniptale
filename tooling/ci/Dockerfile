FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    PATH=/opt/codeql:/opt/semgrep/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    XDG_CACHE_HOME=/workspace/.tmp/ci-cache \
    npm_config_cache=/workspace/.tmp/npm-cache

RUN rm -f /etc/apt/sources.list.d/debian.sources \
    && printf '%s\n' \
      'deb https://snapshot.debian.org/archive/debian/20260829T000000Z bookworm main' \
      'deb https://snapshot.debian.org/archive/debian/20260829T000000Z bookworm-updates main' \
      'deb https://snapshot.debian.org/archive/debian-security/20260829T000000Z bookworm-security main' \
      > /etc/apt/sources.list \
    && printf '%s\n' \
      'Acquire::Check-Valid-Until "false";' \
      'Acquire::Check-Date "false";' \
      > /etc/apt/apt.conf.d/99sniptale-snapshot \
    && printf '%s\n' \
      'Acquire::https::Verify-Peer "false";' \
      > /etc/apt/apt.conf.d/98sniptale-ca-bootstrap \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -f /etc/apt/apt.conf.d/98sniptale-ca-bootstrap \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl git jq procps python3 python3-venv tar unzip \
    && rm -rf /var/lib/apt/lists/*

COPY tooling/configs/ci/npm /opt/sniptale-npm
RUN npm ci --ignore-scripts --prefix /opt/sniptale-npm \
    && ln -sf /opt/sniptale-npm/node_modules/.bin/npm /usr/local/bin/npm \
    && ln -sf /opt/sniptale-npm/node_modules/.bin/npx /usr/local/bin/npx \
    && test "$(npm --version)" = 11.19.1

COPY tooling/configs/ci/toolchain.lock.json /tmp/toolchain.lock.json
COPY tooling/configs/ci/semgrep-requirements.lock /tmp/semgrep-requirements.lock
COPY tooling/configs/ci/playwright /tmp/playwright-package
COPY tooling/test/mutation/package.json tooling/test/mutation/package-lock.json /tmp/mutation-package/
COPY tooling/ci/install-toolchain.mjs /tmp/install-toolchain.mjs
COPY tooling/ci/Dockerfile /tmp/Sniptale.Dockerfile
RUN node /tmp/install-toolchain.mjs /tmp/toolchain.lock.json \
    && rm -rf /tmp/install-toolchain.mjs /tmp/toolchain.lock.json /tmp/semgrep-requirements.lock /tmp/playwright-package /tmp/mutation-package /tmp/Sniptale.Dockerfile \
    && mkdir -p /workspace /opt/playwright \
    && chown -R node:node /workspace /opt/playwright

USER node
WORKDIR /workspace
CMD ["bash"]
