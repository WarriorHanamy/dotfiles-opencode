# ros-devel Reference

## docker-compose.yml patterns

### Single service (devel/debug)

```yaml
version: "3.8"
services:
  app:
    build: .
    image: myapp:latest
    container_name: myapp
    network_mode: host
    stdin_open: true
    tty: true
    environment: &x11_env
      DISPLAY: ${DISPLAY}
      QT_X11_NO_MITSHM: "1"
      NVIDIA_VISIBLE_DEVICES: all
      NVIDIA_DRIVER_CAPABILITIES: all
      __GLX_VENDOR_LIBRARY_NAME: nvidia
    volumes: &x11_vols
      - /tmp/.X11-unix:/tmp/.X11-unix:ro
      - ${HOME}/.Xauthority:/root/.Xauthority:ro
      - .:/workspace
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities: [gpu, graphics]
```

### Multi-phase (devel/test/release)

```yaml
services:
  devel:
    build:
      context: .
      dockerfile: Dockerfile.devel
    image: ${REGISTRY:-local}/app/amd64-ubuntu20.04/devel:latest
    volumes:
      - .:/workspace:rw

  build-test:
    image: ${REGISTRY:-local}/app/amd64-ubuntu20.04/devel:latest
    container_name: app-build-test-${GIT_SHA:-local}
    command: bash -c "catkin config --source . && catkin build --no-status"
    volumes:
      - .:/workspace:rw
      - build-test-artifacts:/workspace/build/test

  build-release:
    image: ${REGISTRY:-local}/app/amd64-ubuntu20.04/devel:latest
    container_name: app-build-release-${GIT_SHA:-local}
    command: bash -c "catkin config --source . && catkin build --no-status"
    volumes:
      - .:/workspace:rw
      - build-release-artifacts:/workspace/build/release

  test:
    image: ${REGISTRY:-local}/app/amd64-ubuntu20.04/devel:latest
    container_name: app-test-${GIT_SHA:-local}
    environment:
      DISPLAY: ""
    volumes:
      - .:/workspace:ro
      - build-test-artifacts:/workspace/build/test:ro
    network_mode: bridge

  release:
    build:
      context: .
      dockerfile: Dockerfile.release
    image: ${REGISTRY:-local}/app/amd64-ubuntu20.04/release:${GIT_SHA:-latest}
    container_name: app-release-${GIT_SHA:-local}
    environment:
      DISPLAY: ${DISPLAY}
      QT_X11_NO_MITSHM: "1"
      QT_QPA_PLATFORM: xcb
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix:ro
      - ${HOME}/.Xauthority:/root/.Xauthority:ro
    network_mode: host

volumes:
  build-test-artifacts:
  build-release-artifacts:
```

## Entrypoint pattern

```bash
#!/bin/bash
set -e

source /opt/ros/{distro}/setup.bash
if [ -f /workspace/devel/setup.bash ]; then
    source /workspace/devel/setup.bash
fi
if [ -d /workspace/bringup ]; then
    export ROS_PACKAGE_PATH="/workspace/bringup:${ROS_PACKAGE_PATH}"
fi

exec "$@"
```

## Devel Dockerfile pattern

```dockerfile
FROM ros:{distro}-ros-base

# Layer 1: Base tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git curl \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: Build system tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-catkin-tools \
    && rm -rf /var/lib/apt/lists/*

# Layer 3: System dev libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libeigen3-dev libopencv-dev libpcl-dev libyaml-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

# Layer 4: Runtime libs (headless EGL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libegl1-mesa libgl1-mesa-dri libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Layer 5: ROS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ros-{distro}-roscpp \
    ros-{distro}-std-msgs \
    ros-{distro}-geometry-msgs \
    ros-{distro}-pcl-ros \
    && rm -rf /var/lib/apt/lists/*
```

## Release Dockerfile pattern

```dockerfile
FROM osrf/ros:{distro}-desktop-full

# Layers 1-5 same as devel Dockerfile

# Layer 6: X11/Wayland runtime (if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwayland-client0 libwayland-server0 libgtk-3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build-release /workspace/build/release /workspace
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/bin/bash"]
```

## Bringup layout pattern

```
bringup/
  launch/ [purpose]_[app].launch
  config/ [purpose]_[node].yaml
          [view].rviz
  data/   [purpose]_[app].txt
  scripts/ *.py, *.sh
  maps/   *.pcd
```

## .dockerignore

```
.git
build/
devel/
install/
logs/
*.pyc
__pycache__/
*.swp
*.swo
.vscode/
.idea/
*.bag
artifacts/
```

## Common invocations

```bash
docker compose build devel
DOCKER_BUILDKIT=0 docker compose build --no-cache devel
docker compose run --rm build-test
docker compose run --rm test bash -c "roslaunch bringup run.launch"
docker compose run --rm release bash
docker compose exec app bash
```
