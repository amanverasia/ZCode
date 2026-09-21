# Apply remaining model-profile UI/i18n wiring

Core profile code is already on `main`. These patches finish Settings, composer shortcuts, and i18n (files too large for MCP direct upload).

```bash
cd ~/src/ZCode
git pull --ff-only origin main
git apply _agent_assemble/model-profiles/*.patch
# optional cleanup:
git rm -r _agent_assemble/model-profiles
git commit -m "fix(ui): apply model-profiles Settings/toolbar/i18n patches"
git push origin main
```

Verified `git apply` clean on `5f4a9f8`.
