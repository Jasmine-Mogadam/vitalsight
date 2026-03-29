ARG UBUNTU_VERSION=22.04
ARG CMAKE_VERSION=3.27.0
FROM ubuntu:${UBUNTU_VERSION}
ARG CMAKE_VERSION

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libcurl4-openssl-dev \
    libssl-dev \
    libv4l-dev \
    libunwind-dev \
    libopengl-dev \
    libglvnd-dev \
    libgl-dev \
    libegl-dev \
    libgles-dev \
    libgl1-mesa-dev \
    libegl1-mesa-dev \
    libgles2-mesa-dev \
    mesa-common-dev \
    libglu1-mesa-dev \
    freeglut3-dev \
    libx11-dev \
    libxext-dev \
    libxrandr-dev \
    libxinerama-dev \
    libxcursor-dev \
    libxi-dev \
    libgtk-3-dev \
    libgtk-3-0 \
    libdrm-dev \
    libgbm-dev \
    libwayland-dev \
    wayland-protocols \
    libprotobuf-dev \
    protobuf-compiler \
    libabsl-dev \
    libgoogle-glog-dev \
    libgflags-dev \
    gnupg \
    lsb-release \
    software-properties-common \
    build-essential \
    pkg-config \
    git \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/cmake.sh "https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-linux-x86_64.sh" \
  && chmod +x /tmp/cmake.sh \
  && /tmp/cmake.sh --skip-license --prefix=/usr/local \
  && rm -f /tmp/cmake.sh \
  && cmake --version

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN curl -s "https://presage-security.github.io/PPA/KEY.gpg" | gpg --dearmor > /etc/apt/trusted.gpg.d/presage-technologies.gpg \
  && curl -s --compressed -o /etc/apt/sources.list.d/presage-technologies.list "https://presage-security.github.io/PPA/presage-technologies.list" \
  && apt-get update \
  && apt-get install -y --no-install-recommends libsmartspectra-dev \
  && rm -rf /var/lib/apt/lists/*

RUN if [ ! -e /usr/lib/x86_64-linux-gnu/libGLESv3.so ] && [ -e /usr/lib/x86_64-linux-gnu/libGLESv2.so ]; then \
      ln -s /usr/lib/x86_64-linux-gnu/libGLESv2.so /usr/lib/x86_64-linux-gnu/libGLESv3.so; \
    fi \
  && if [ ! -e /usr/lib/aarch64-linux-gnu/libGLESv3.so ] && [ -e /usr/lib/aarch64-linux-gnu/libGLESv2.so ]; then \
      ln -s /usr/lib/aarch64-linux-gnu/libGLESv2.so /usr/lib/aarch64-linux-gnu/libGLESv3.so; \
    fi

WORKDIR /app

COPY presage-bridge /app/presage-bridge
RUN bash /app/presage-bridge/build.sh

COPY frontend/package*.json /app/frontend/
RUN npm --prefix /app/frontend ci

COPY backend/package*.json /app/backend/
RUN npm --prefix /app/backend ci --omit=dev

COPY frontend /app/frontend
RUN npm --prefix /app/frontend run build

COPY backend /app/backend
RUN mkdir -p /app/backend/public \
  && cp -r /app/frontend/dist/. /app/backend/public/

COPY fly-entrypoint.sh /app/fly-entrypoint.sh
RUN chmod +x /app/fly-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV PRESAGE_BRIDGE_URL=http://127.0.0.1:8787
ENV PRESAGE_BRIDGE_HOST=127.0.0.1
ENV PRESAGE_BRIDGE_PORT=8787
ENV PRESAGE_BRIDGE_MODE=sdk
ENV PRESAGE_ALLOW_VIDEO_UPLOAD_IN_PRODUCTION=true

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["/app/fly-entrypoint.sh"]
