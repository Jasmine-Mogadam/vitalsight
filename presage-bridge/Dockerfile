ARG UBUNTU_VERSION=22.04
FROM ubuntu:${UBUNTU_VERSION}

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    nodejs \
    build-essential \
    cmake \
    pkg-config \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN curl -s "https://presage-security.github.io/PPA/KEY.gpg" | gpg --dearmor > /etc/apt/trusted.gpg.d/presage-technologies.gpg \
  && curl -s --compressed -o /etc/apt/sources.list.d/presage-technologies.list "https://presage-security.github.io/PPA/presage-technologies.list" \
  && apt-get update \
  && apt-get install -y --no-install-recommends libsmartspectra-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY presage-bridge /app/presage-bridge

RUN bash /app/presage-bridge/build.sh

EXPOSE 8787

CMD ["node", "/app/presage-bridge/server.cjs"]
