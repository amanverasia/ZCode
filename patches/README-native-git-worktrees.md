# Rebuild full patch

```bash
n=$(cat patches/native-git-worktrees-7f2313a.b64.n)
for i in $(seq -w 0 $((n-1))); do
  cat "patches/native-git-worktrees-7f2313a.b64.$i"
done | base64 -d > patches/native-git-worktrees-7f2313a.patch
git am patches/native-git-worktrees-7f2313a.patch
```
