#!/usr/bin/env bash
# Puts a "Which file do I download?" table at the top of a GitHub Release's description, built from the
# files actually attached to it (so a release that gets its macOS installers later is updated correctly).
# Any previous guide is replaced; the rest of the description (e.g. "What's Changed") is kept.
#
# Usage: release-download-guide.sh <tag>      Needs GH_TOKEN and GITHUB_REPOSITORY (set in GitHub Actions).
set -euo pipefail

tag="$1"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
json="$(gh release view "$tag" --repo "$repo" --json body,assets)"
body="$(jq -r '.body // ""' <<<"$json")"
assets="$(jq -r '.assets[].name' <<<"$json")"
base="https://github.com/$repo/releases/download/$tag"

# One table row per platform whose installer is attached to the release.
row() {
  local file
  file="$(grep -E "$2" <<<"$assets" | grep -v '\.blockmap$' | head -n 1 || true)"
  if [ -n "$file" ]; then printf '| %s | [`%s`](%s/%s) |\n' "$1" "$file" "$base" "$file"; fi
}
rows="$(
  row '**Windows** 10 / 11' 'windows-x64-setup\.exe$'
  row '**Mac** with Apple chip (M1–M4) · **Mac** con chip Apple' 'macos-arm64\.dmg$'
  row '**Mac** with Intel chip · **Mac** con chip Intel' 'macos-x64\.dmg$'
  row '**Linux**' 'linux-x86_64\.AppImage$'
  row '**Linux** (Ubuntu / Debian)' 'linux-amd64\.deb$'
)"
if [ -z "$rows" ]; then
  echo "No installers attached to $tag yet; nothing to do."
  exit 0
fi

# Drop a guide added by an earlier run, keep everything else.
rest="$(awk '/<!-- download-guide:start -->/{skip=1} !skip{print} /<!-- download-guide:end -->/{skip=0}' <<<"$body" | sed '/[^[:space:]]/,$!d')"

{
  echo '<!-- download-guide:start -->'
  echo '## ⬇️ Which file do I download? · Quale file scarico?'
  echo
  echo 'Download **only one file**, the one for your computer · Scarica **un solo file**, quello del tuo computer:'
  echo
  echo '| Your computer · Il tuo computer | File |'
  echo '| --- | --- |'
  echo "$rows"
  echo
  echo 'Which Mac do you have? Apple menu (top left) → **About This Mac**: "Apple M…" = Apple chip, "Intel" = Intel chip.  '
  echo 'Che Mac hai? Menu Apple (in alto a sinistra) → **Informazioni su questo Mac**: "Apple M…" = chip Apple, "Intel" = chip Intel.'
  echo
  echo '> [!IMPORTANT]'
  echo '> **Don'"'"'t download** the `.blockmap` and `.yml` files or "Source code": the launcher uses them to update itself.  '
  echo '> **Non scaricare** i file `.blockmap` e `.yml` né "Source code": servono al launcher per aggiornarsi da solo.'
  echo '<!-- download-guide:end -->'
  if [ -n "$(tr -d '[:space:]' <<<"$rest")" ]; then
    echo
    echo "$rest"
  fi
} >release-notes.md

gh release edit "$tag" --repo "$repo" --notes-file release-notes.md
echo "Updated the description of $tag."
