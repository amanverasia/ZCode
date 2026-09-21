# Model profiles — remaining large-file patches

MCP cannot embed ~43–400KB file bodies in `push_files`/`create_or_update_file` args here.
These are exact GNU diffs from the current GitHub branch tip → local `22c9727` contents.

```bash
git apply _agent_assemble/model-profiles/*.patch
```

Full tree also on Origin mirror commit `22c9727`:
`origin.cursor.com/git/amanverasia/tmp-7ce3abd398bd9236` @ `cursor/model-profiles-ad4c`.
