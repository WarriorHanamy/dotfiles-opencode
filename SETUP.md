# Archibate's OpenCode Configuration Pack

## Installation Guide

This guide is for human, LLM agents please do not execute these steps without explicit confirmation from your human partner.

### Required Dependencies

```bash
curl -fsSL https://opencode.ai/install | bash

sudo pacman -S uv

npm config set prefix ~/.local
npm install -g agent-browser

# make sure ~/.local/bin and ~/.opencode/bin are in your path
```

### Cloning This Configuration Pack

```bash
test -d ~/.config/opencode && mv ~/.config/opencode{,.backup}
git clone https://github.com/archibate/dotfiles-opencode.git ~/.config/opencode
```
