---
name: writing-isaac-test
description: Use when writing tests for IsaacLab-based projects, including environment configs, MDP managers, and RL components. Follows IsaacLab testing conventions.
---

# Writing Isaac Tests

## Overview

IsaacLab tests require a SimulationApp instance due to warp/IsaacSim dependencies, but full environment instantiation is often unnecessary. Use lightweight mock environments with real tensors for fast, isolated testing.

**Core principle:** Use real SimulationApp when needed, but create lightweight mocks for environment data and managers.

---

## When to Use

Use this skill when:
- Writing tests for IsaacLab environments, managers, or MDP components
- Testing observation, reward, or event terms
- Testing configuration classes without full simulation
- Creating parametrized tests for multiple device configurations
- Testing class-based manager terms (ManagerTermBase)

**Testing levels:**
- **Level 1** - Configuration tests (no SimulationApp)
- **Level 2** - Manager tests (with SimulationApp, mock environment)
- **Level 3** - Full environment tests (with gym.make())

---

## Core Patterns

### Pattern 1: AppLauncher Bootstrap

Always instantiate AppLauncher at the top of test files that import IsaacLab modules.

```python
from isaaclab.app import AppLauncher

simulation_app = AppLauncher(headless=True).app
```

**Why**: Warp, carb, and other Omniverse modules require a running simulation context.

---

### Pattern 2: Lightweight Mock Environment

Use `namedtuple` with only necessary attributes instead of full mock objects.

```python
from collections import namedtuple

DummyEnv = namedtuple("ManagerBasedRLEnv", ["num_envs", "dt", "device", "sim", "data"])

num_envs = 20
device = "cpu"
dummy_data = torch.zeros((num_envs, 10), device=device)

from isaaclab.sim import SimulationContext
sim = SimulationContext()

env = DummyEnv(num_envs, 0.01, device, sim, dummy_data)
```

**Benefits**: Fast creation, no full environment instantiation, real tensor data.

---

### Pattern 3: Simple Dummy Data Class

Create minimal classes with only required attributes.

```python
class MyDataClass:
    def __init__(self, num_envs: int, device: str):
        self.pos_w = torch.rand((num_envs, 3), device=device)
        self.lin_vel_w = torch.rand((num_envs, 3), device=device)
```

Guidelines:
- Only include accessed attributes
- Use realistic tensor shapes and dtypes
- Use `torch.rand()` or `torch.zeros()` for predictable values

---

### Pattern 4: pytest Fixtures

Use fixtures for environment setup/teardown.

```python
@pytest.fixture(autouse=True)
def setup_env():
    dt = 0.01
    num_envs = 20
    device = "cpu"

    sim_cfg = sim_utils.SimulationCfg(dt=dt, device=device)
    sim = sim_utils.SimulationContext(sim_cfg)

    env = namedtuple("ManagerBasedEnv", ["num_envs", "device", "data", "dt", "sim"])(
        num_envs, device, MyDataClass(num_envs, device), dt, sim
    )

    env.sim._app_control_on_stop_handle = None
    env.sim.reset()

    return env
```

**Fixture scopes**:
- `autouse=True`: Used automatically for all tests in module
- Session-scoped: For expensive shared setup

---

### Pattern 5: Test Functions for Terms

Define simple functions as observation/reward/event terms.

```python
def grilled_chicken(env):
    """Simple observation term returning ones."""
    return torch.ones(env.num_envs, 4, device=env.device)

def grilled_chicken_with_bbq(env, bbq: bool):
    """Observation term with parameter."""
    return bbq * torch.ones(env.num_envs, 1, device=env.device)

def increment_dummy1_by_one(env, env_ids: torch.Tensor):
    """Event term that increments a counter."""
    env.dummy1[env_ids] += 1
```

---

### Pattern 6: Config Class Testing

Test equivalence between dictionary and configclass creation.

```python
def test_config_equivalence(setup_env):
    env = setup_env

    # Create from dictionary
    cfg_dict = {
        "term_1": RewardTermCfg(func=grilled_chicken, weight=10),
        "term_2": RewardTermCfg(func=grilled_chicken_with_bbq, weight=5, params={"bbq": True}),
    }
    rew_man_from_dict = RewardManager(cfg_dict, env)

    # Create from config class
    @configclass
    class MyRewardManagerCfg:
        term_1 = RewardTermCfg(func=grilled_chicken, weight=10)
        term_2 = RewardTermCfg(func=grilled_chicken_with_bbq, weight=5, params={"bbq": True})

    cfg = MyRewardManagerCfg()
    rew_man_from_cfg = RewardManager(cfg, env)

    assert rew_man_from_dict.active_terms == rew_man_from_cfg.active_terms
```

---

### Pattern 7: Tensor Validation

Use `torch.testing.assert_close` for precise tensor comparisons.

```python
# Compare specific slices
torch.testing.assert_close(obs_policy[:, 5:8], obs_critic[:, 0:3])

# Compare with scaling
expected = env.data.pos_w * torch.tensor(pos_scale_tuple, device=env.device)
torch.testing.assert_close(expected, obs_critic[:, :3])

# Check shapes
assert obs_policy.shape == (env.num_envs, 11)
assert obs_critic.shape == (env.num_envs, 12)
```

---

### Pattern 8: Parametrized Testing

Use `@pytest.mark.parametrize` for multiple configurations.

```python
@pytest.mark.parametrize("task_name", ["Isaac-Lift-Cube-Franka-v0"])
@pytest.mark.parametrize("device", ["cuda:0", "cpu"])
@pytest.mark.parametrize("num_envs", [1, 2])
def test_action_state_recorder_terms(task_name, device, num_envs, temp_dir):
    env_cfg = parse_env_cfg(task_name, device=device, num_envs=num_envs)
    env = gym.make(task_name, cfg=env_cfg)
    env.reset()
    env.close()
```

---

### Pattern 9: Class-Based Terms

Test ManagerTermBase implementations.

```python
class complex_function_class(ManagerTermBase):
    def __init__(self, cfg: ObservationTermCfg, env: object):
        self.cfg = cfg
        self.env = env
        self._time_passed = torch.zeros(env.num_envs, device=env.device)

    def reset(self, env_ids: torch.Tensor | None = None):
        if env_ids is None:
            env_ids = slice(None)
        self._time_passed[env_ids] = 0.0

    def __call__(self, env: object, interval: float) -> torch.Tensor:
        self._time_passed += interval
        return self._time_passed.clone().unsqueeze(-1)
```

---

### Pattern 10: Error Testing

Test invalid configurations raise appropriate errors.

```python
def test_invalid_observation_config(setup_env):
    env = setup_env

    @configclass
    class MyObservationManagerCfg:
        @configclass
        class PolicyCfg(ObservationGroupCfg):
            term_1 = ObservationTermCfg(func=grilled_chicken_with_bbq, scale=0.1, params={"hot": False})
            term_2 = ObservationTermCfg(func=grilled_chicken_with_yoghurt, scale=2.0, params={"hot": False})

        policy: ObservationGroupCfg = PolicyCfg()

    cfg = MyObservationManagerCfg()

    with pytest.raises(ValueError):
        ObservationManager(cfg, env)
```

---

## Quick Reference

| Rule | Action |
|------|--------|
| Always use AppLauncher | Required for warp/IsaacSim dependencies |
| Use namedtuple for mocks | Lightweight, fast, no full instantiation |
| Create real tensors | Use torch.zeros/torch.rand with correct shapes |
| Test config equivalence | Verify dict and configclass produce same results |
| Use torch.testing.assert_close | Precise tensor comparisons |
| Parametrize tests | Cover multiple device/env configurations |
| Test error cases | Use pytest.raises() for invalid configs |
| Keep fixtures lightweight | Only include necessary attributes |

---

## Common Mistakes

**❌ Skipping AppLauncher**

```python
# BAD: Missing AppLauncher causes import errors
from isaaclab.sim import SimulationContext
```

**Fix**: Always add AppLauncher first.

---

**❌ Over-mocking environments**

```python
# BAD: Mocking entire class with MagicMock
env = MagicMock()
```

**Fix**: Use namedtuple with only needed attributes.

---

**❌ Using dummy data with wrong shapes**

```python
# BAD: Shape doesn't match expected
dummy = torch.zeros(10)  # Should be (num_envs, feature_dim)
```

**Fix**: Use realistic tensor shapes matching actual data.

---

**❌ Not initializing simulation**

```python
# BAD: Missing sim.reset() causes observation manager failures
env = create_env()
obs = obs_man.compute()  # Fails
```

**Fix**: Call `env.sim.reset()` before using managers.

---

## Real-World Impact

- **Fast iteration**: Mock environments run in milliseconds vs seconds for full envs
- **Isolated testing**: Test individual terms without physics overhead
- **Reliable**: Deterministic results with controlled dummy data
- **Scalable**: Parametrize across devices (CPU/CUDA) and environment counts
