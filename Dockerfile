# Base image
FROM node:22-bookworm-slim

# Copy repository
COPY . /metrics
WORKDIR /metrics

# Setup
RUN chmod +x /metrics/source/app/action/index.mjs \
  # Install chrome/chromium, fonts to support major charsets and skip chromium download on puppeteer install
  && apt-get update \
  && apt-get install -y wget gnupg ca-certificates libgconf-2-4 \
  && if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
       mkdir -p /etc/apt/keyrings \
       && wget -q -O- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
       && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
       && apt-get update \
       && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 libx11-xcb1 libxtst6 lsb-release --no-install-recommends; \
     else \
       apt-get update \
       && apt-get install -y chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 libx11-xcb1 libxtst6 lsb-release --no-install-recommends \
       && ln -s /usr/bin/chromium /usr/bin/google-chrome-stable; \
     fi \
  # Install deno for miscellaneous scripts
  && apt-get install -y curl unzip \
  && curl -fsSL https://deno.land/x/install/install.sh | DENO_INSTALL=/usr/local sh \
  # Install ruby to support github licensed gem
  && apt-get install -y ruby-full git g++ cmake pkg-config libssl-dev xz-utils \
  && gem install licensed \
  # Install python for node-gyp
  && apt-get install -y python3 \
  # Clean apt/lists
  && rm -rf /var/lib/apt/lists/* \
  # Install node modules and rebuild indexes
  && npm ci \
  && npm run build

# Environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_BROWSER_PATH "google-chrome-stable"

# Execute GitHub action
ENTRYPOINT node /metrics/source/app/action/index.mjs
