FROM node:22.12.0-bookworm-slim@sha256:35531c52ce27b6575d69755c73e65d4468dba93a25644eed56dc12879cae9213

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    PATH=/opt/codeql:/opt/semgrep/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    XDG_CACHE_HOME=/workspace/.tmp/ci-cache \
    npm_config_cache=/workspace/.tmp/npm-cache

RUN rm -f /etc/apt/sources.list.d/debian.sources \
    && printf '%s\n' \
      'deb https://snapshot.debian.org/archive/debian/20250115T000000Z bookworm main' \
      'deb https://snapshot.debian.org/archive/debian/20250115T000000Z bookworm-updates main' \
      'deb https://snapshot.debian.org/archive/debian-security/20250115T000000Z bookworm-security main' \
      > /etc/apt/sources.list \
    && printf '%s\n' \
      'Acquire::Check-Valid-Until "false";' \
      'Acquire::Check-Date "false";' \
      > /etc/apt/apt.conf.d/99sniptale-snapshot \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git jq python3 python3-venv tar unzip \
    && rm -rf /var/lib/apt/lists/*

COPY tooling/configs/ci/toolchain.lock.json /tmp/toolchain.lock.json
COPY tooling/configs/ci/semgrep-requirements.lock /tmp/semgrep-requirements.lock
COPY tooling/configs/ci/playwright /tmp/playwright-package
COPY tooling/ci/install-toolchain.mjs /tmp/install-toolchain.mjs
COPY tooling/ci/Dockerfile /tmp/Sniptale.Dockerfile
RUN node /tmp/install-toolchain.mjs /tmp/toolchain.lock.json \
    && rm -rf /tmp/install-toolchain.mjs /tmp/toolchain.lock.json /tmp/semgrep-requirements.lock /tmp/playwright-package /tmp/Sniptale.Dockerfile \
    && mkdir -p /workspace /opt/playwright \
    && chown -R node:node /workspace /opt/playwright

USER node
WORKDIR /workspace
CMD ["bash"]
