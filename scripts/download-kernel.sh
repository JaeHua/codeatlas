#!/bin/bash
set -e

KERNEL_VERSION="0.21"
SOURCE_DIR="public/kernel-source"
TARBALL="linux-${KERNEL_VERSION}.tar.gz"
DOWNLOAD_URL="https://mirrors.edge.kernel.org/pub/linux/kernel/Historic/linux-${KERNEL_VERSION}.tar.gz"

echo "Downloading Linux Kernel ${KERNEL_VERSION}..."

if [ ! -d "$SOURCE_DIR" ]; then
  mkdir -p "$SOURCE_DIR"
fi

cd "$SOURCE_DIR"

if [ -f "$TARBALL" ]; then
  echo "Tarball already exists, skipping download."
else
  curl -L -o "$TARBALL" "$DOWNLOAD_URL"
fi

echo "Extracting..."
tar xzf "$TARBALL" --strip-components=1

echo "Done. Source extracted to $SOURCE_DIR"
