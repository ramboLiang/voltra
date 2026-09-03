#!/usr/bin/env bash
# 把 site/（静态落地页源文件）同步到 gh-pages 分支（GitHub / Gitee Pages 的部署源）。
# 用法：./site/publish.sh && git push origin gh-pages
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH=gh-pages
TMP=$(mktemp -d)
trap 'git worktree remove --force "$TMP" 2>/dev/null || rm -rf "$TMP"' EXIT

# 注意 1：不要把 worktree add 的报错吞掉（>/dev/null 2>&1）——
# 曾发生过 add 失败后继续执行、提交了残缺树且毫无报错的事故。
# 注意 2：必须用【挂接】工作区（不带 --detach）。detach 下 commit 不移动分支 ref，
# 提交会随 worktree 删除而悬空，分支永远停在旧树——曾因此把旧内容"发布"出去。
if git rev-parse --verify "refs/heads/$BRANCH" >/dev/null 2>&1; then
  git worktree add "$TMP" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$TMP" HEAD
fi

# 清空分支内容，只保留 site/ 的文件
find "$TMP" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp site/* "$TMP"/

# 校验 1：site/ 下每个文件都落到了工作区
for f in site/*; do
  [ -f "$TMP/$(basename "$f")" ] || { echo "错误: $(basename "$f") 未同步到 $TMP" >&2; exit 1; }
done

git -C "$TMP" add -A

# 校验 2：site/ 下每个文件都进了暂存区（索引）。
# 用 ls-files 而非 diff --cached：内容未变的文件不出现在 diff 里，但必须在索引中。
staged=$(git -C "$TMP" ls-files --cached)
for f in site/*; do
  echo "$staged" | grep -qx "$(basename "$f")" || { echo "错误: $(basename "$f") 未进暂存区（可能被忽略规则挡住）" >&2; exit 1; }
done

if ! git -C "$TMP" diff --cached --quiet; then
  git -C "$TMP" commit -q -m "site: sync from site/"
  echo "已同步到 $BRANCH（$(git -C "$TMP" log --oneline -1)）。运行 git push origin $BRANCH 发布。"
else
  echo "$BRANCH 无变化。"
fi
