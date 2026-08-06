Place the operator-provided moon world file here as `<moon_id>.moon`.

Filename = the moon's 10-hex-char ZeroTier address, e.g. `9f19f93e2c.moon`.

Installation (see SKILL.md):

```bash
sudo cp assets/<moon_id>.moon /var/lib/zerotier-one/moons.d/
sudo zerotier-cli orbit <moon_id> <moon_id>
```
