# Agent-PS Bundle

Version: 1.0.0
Variant: Minimal (requires npm install)

## Quick Start

1. Copy this bundle to your project:
   ```bash
   cp -r . /path/to/your-project/.agent-ps
   ```

2. Or use the install script:
   ```bash
   ./scripts/install.sh /path/to/your-project
   ```

3. Add your API key to `.devcontainer/.env`:
   ```
   ANTHROPIC_API_KEY=your-key-here
   ```

4. Merge settings from `templates/devcontainer-fragment.json` into your `.devcontainer/devcontainer.json`

5. Rebuild your devcontainer

## Manual Start

```bash
./scripts/start.sh
```

## Health Check

```bash
./scripts/healthcheck.sh
```

## Documentation

See `docs/INTEGRATION.md` for detailed integration instructions.
