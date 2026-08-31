FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    PATH=/opt/codeql:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
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
    && test -s /etc/ssl/certs/ca-certificates.crt \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl git jq procps tar unzip \
    && rm -rf /var/lib/apt/lists/*

COPY tooling/configs/ci/npm /opt/sniptale-npm
COPY tooling/configs/ci/toolchain.lock.json tooling/ci/runtime-parity.mjs /opt/sniptale-ci/
RUN npm ci --ignore-scripts --prefix /opt/sniptale-npm \
    && ln -sf /opt/sniptale-npm/node_modules/.bin/npm /usr/local/bin/npm \
    && ln -sf /opt/sniptale-npm/node_modules/.bin/npx /usr/local/bin/npx \
    && node /opt/sniptale-ci/runtime-parity.mjs /opt/sniptale-ci/toolchain.lock.json > /tmp/runtime-parity.json \
    && test -s /tmp/runtime-parity.json \
    && rm -f /tmp/runtime-parity.json

COPY tooling/configs/ci/toolchain.lock.json /tmp/toolchain.lock.json
COPY tooling/configs/ci/playwright /tmp/playwright-package
COPY tooling/test/mutation/package.json tooling/test/mutation/package-lock.json /tmp/mutation-package/
COPY tooling/ci/install-toolchain.mjs /tmp/install-toolchain.mjs
COPY tooling/ci/Dockerfile /tmp/Sniptale.Dockerfile
RUN node /tmp/install-toolchain.mjs /tmp/toolchain.lock.json \
    && rm -rf /tmp/install-toolchain.mjs /tmp/toolchain.lock.json /tmp/playwright-package /tmp/mutation-package /tmp/Sniptale.Dockerfile \
    && mkdir -p /workspace /opt/playwright \
    && chown -R node:node /workspace /opt/playwright

USER node
WORKDIR /workspace
CMD ["bash"]
