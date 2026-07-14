---
name: ros-docker-tags
description: Use when Docker build fails with "not found" for a ros:* image tag, when writing or editing FROM lines in Dockerfiles for ROS projects, or when debugging ROS Docker image pull errors.
---

# ROS Docker Tags

## Overview

ROS官方 Docker 镜像 tag 有固定命名模式，`ros:noetic-base` 不存在——正确的 tag 是 `ros:noetic-ros-base`。

## Quick Reference

| 写错的 tag | 正确的 tag | 说明 |
|-----------|-----------|------|
| `noetic-base` | `noetic-ros-base` | Base Noetic (Ubuntu 20.04) |
| `noetic` | `noetic` or `noetic-ros-base` | 两者相同，推荐显式写 `noetic-ros-base` |
| `humble-base` | `humble-ros-base` | Base Humble (Ubuntu 22.04) |
| `jazzy-base` | `jazzy-ros-base` | Base Jazzy (Ubuntu 24.04) |

## 验证 tag 是否存在

```bash
# 查询某个 distro 的所有可用 tag
curl -s "https://hub.docker.com/v2/repositories/library/ros/tags/?page_size=100&name=noetic" \
  | python3 -c "import sys,json; [print(t['name']) for t in json.load(sys.stdin).get('results',[])]"

# 或直接 pull 测试
docker pull ros:noetic-ros-base
```

## 常见错误

- `noetic-base` → `noetic-ros-base` — 缺了 `ros-` 中缀
- `noetic-ros` → `noetic-robot` 或 `noetic-ros-base` — `ros` 不是独立 suffix
- `noetic-latest` → `noetic` — 没有 `-latest` tag
