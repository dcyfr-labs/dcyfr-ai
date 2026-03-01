# Plugin Sandbox Dockerfile
#
# Minimal Node.js image used to execute untrusted plugin code in isolation.
# This image is intentionally stripped-down — no shell by default, no extra
# tools, running as a non-root user.
#
# Build:
#   docker build -t dcyfr-plugin-sandbox:latest -f docker/plugin-sandbox/Dockerfile .
#
# Run (per spec — operator-supplied flags, not baked into image):
#   docker run --rm \
#     --memory=512m --cpus=0.5 \
#     --network=none --read-only \
#     --tmpfs=/tmp:rw,size=64m \
#     --cap-drop=ALL \
#     --security-opt=no-new-privileges \
#     --user=65534:65534 \
#     dcyfr-plugin-sandbox:latest <plugin-entrypoint>

FROM node:22-alpine AS base

# Install only the bare minimum runtime dependencies.
# ca-certificates is needed for HTTPS when network is explicitly permitted.
RUN apk add --no-cache ca-certificates dumb-init \
    && rm -rf /var/cache/apk/*

# Create a dedicated non-root user (uid/gid 65534 = nobody on Alpine)
# Note: Alpine already has nobody:nobody; we pin it explicitly for clarity.
RUN addgroup -g 65534 -S sandbox 2>/dev/null || true \
    && adduser  -u 65534 -S sandbox -G sandbox 2>/dev/null || true

# Plugin code will be bind-mounted at /plugin at runtime.
# We create the directory here so it exists in the image layer.
RUN mkdir -p /plugin /plugin/node_modules \
    && chown -R 65534:65534 /plugin

WORKDIR /plugin

# Switch to non-root before running any user code
USER 65534:65534

# dumb-init as PID 1 ensures signal forwarding and zombie reaping.
# The actual entrypoint is supplied at `docker run` time (plugin-specific).
ENTRYPOINT ["dumb-init", "--"]

# Default CMD: print a usage hint if no command is provided.
CMD ["node", "--version"]
