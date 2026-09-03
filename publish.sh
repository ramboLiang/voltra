#!/usr/bin/env bash
# 把 site/（静态落地页源文件）同步到 gh-pages 分支（GitHub / Gitee Pages 的部署源）。
# 用法：./site/publish.sh && git push origin gh-pages
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH=gh-pages
TMP=$(mktemp -d)
trap 'git worktree remove --force "$TMP" 2>/dev/null || rm -rf "$TMP"' EXIT

git worktree add --detach "$TMP" "$BRANCH" >/dev/null 2>&1 \
  || git worktree add -b "$BRANCH" "$TMP" HEAD >/dev/null

# 清空分支内容，只保留 site/ 的文件
find "$TMP" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp site/* "$TMP"/

git -C "$TMP" add -A
if ! git -C "$TMP" diff --cached --quiet; then
  git -C "$TMP" commit -q -m "site: sync from site/"
  echo "已同步到 $BRANCH。运行 git push origin $BRANCH 发布。"
else
  echo "$BRANCH 无变化。"
fi
