#!/usr/bin/env bash
# Publishes the Polymarket Prediction Market mod on Modrinth, which is where Aternos (and other hosts that only
# install mods from CurseForge and Modrinth) get it.
#
# - The first run creates the Modrinth project: title, summary, description (mods/polymarket/modrinth.md), icon and
#   screenshots. Later runs keep its summary and description in step with this repository.
# - Every run uploads the release's mod jar as a new version, unless that version is already on Modrinth.
# - A project that is still a draft is submitted for Modrinth's review. Aternos lists it once it's approved.
#
# Usage: modrinth-publish.sh [tag]   (no tag: the latest release)
# Needs GH_TOKEN and GITHUB_REPOSITORY (set in GitHub Actions) and MODRINTH_TOKEN: a Modrinth personal access token
# with the Create projects, Read projects, Write projects, Create versions and Read versions scopes.
# Without MODRINTH_TOKEN it fails, or with OPTIONAL=true skips quietly (the release workflow does that).
set -euo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
api="${MODRINTH_API:-https://api.modrinth.com/v2}"
slug="${MODRINTH_PROJECT:-polymarket-prediction-market}"
mod=mods/polymarket
# Must match the Minecraft range in mods.toml.
game_versions='["26.3"]'
summary_text="Trade Polymarket's live Bitcoin Up or Down market with gold ingots on a big screen in your world, and climb the leaderboard. No real money."
ua="$repo (Modrinth publish workflow)"

note() { echo "$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n\n' "$*" >>"$GITHUB_STEP_SUMMARY"; fi; }

if [ -z "${MODRINTH_TOKEN:-}" ]; then
  message="The MODRINTH_TOKEN secret isn't set, so the mod wasn't published on Modrinth (see $mod/README.md, \"On a server\")."
  if [ "${OPTIONAL:-false}" = true ]; then note "$message"; exit 0; fi
  echo "::error::$message"
  exit 1
fi

# modrinth METHOD PATH [curl options]: prints the response, or fails with Modrinth's error message.
modrinth() {
  local method="$1" path="$2" out code
  shift 2
  out="$(mktemp)"
  code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$api$path" \
    -H "Authorization: $MODRINTH_TOKEN" -H "User-Agent: $ua" "$@")"
  if [ "$code" -ge 400 ]; then
    echo "::error::Modrinth answered $method $path with HTTP $code: $(cat "$out")" >&2
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
}

# The jar attached to the release.
tag="${1:-$(gh release view --repo "$repo" --json tagName --jq .tagName)}"
dist="$(mktemp -d)"
gh release download "$tag" --repo "$repo" --pattern 'polymarket-prediction-market-*.jar' --dir "$dist"
jars=("$dist"/polymarket-prediction-market-*.jar)
jar="${jars[0]}"
version="$(basename "$jar" .jar)"
version="${version#polymarket-prediction-market-}"
echo "Release $tag has Polymarket Prediction Market $version."

# The project: created the first time.
exists="$(curl -sS -o /dev/null -w '%{http_code}' "$api/project/$slug" \
  -H "Authorization: $MODRINTH_TOKEN" -H "User-Agent: $ua")"
if [ "$exists" = 404 ]; then
  data="$(jq -n --arg slug "$slug" --arg summary "$summary_text" --rawfile body "$mod/modrinth.md" --arg repo "$repo" '{
    slug: $slug, title: "Polymarket Prediction Market", description: $summary, body: $body, project_type: "mod",
    categories: ["economy", "minigame"], additional_categories: ["decoration"],
    client_side: "required", server_side: "required", license_id: "GPL-3.0-or-later",
    source_url: "https://github.com/\($repo)/tree/main/mods/polymarket",
    issues_url: "https://github.com/\($repo)/issues",
    requested_status: "approved", is_draft: true, initial_versions: []
  }')"
  modrinth POST /project --form-string "data=$data" \
    -F "icon=@$mod/src/main/resources/polymarket_billboard.png;type=image/png" >/dev/null
  note "Created the Modrinth project https://modrinth.com/mod/$slug"
elif [ "$exists" -ge 400 ]; then
  modrinth GET "/project/$slug" >/dev/null
fi
project="$(modrinth GET "/project/$slug")"
id="$(jq -r .id <<<"$project")"

# Summary and description follow this repository: edit modrinth.md rather than the page on Modrinth.
modrinth PATCH "/project/$id" -H 'Content-Type: application/json' \
  --data "$(jq -n --arg summary "$summary_text" --rawfile body "$mod/modrinth.md" '{description: $summary, body: $body}')" >/dev/null

# Screenshots, if the project has none yet.
if [ "$(jq '.gallery | length' <<<"$project")" = 0 ]; then
  order=0
  while IFS='|' read -r file title; do
    modrinth POST "/project/$id/gallery" -H 'Content-Type: image/png' --data-binary "@$mod/docs/$file" \
      --url-query ext=png --url-query "featured=$([ "$order" = 0 ] && echo true || echo false)" \
      --url-query "title=$title" --url-query "ordering=$order" >/dev/null
    order=$((order + 1))
  done <<'EOF'
situation-room.png|A situation room built around the billboard
board.png|The live market and the leaderboard
trading.png|Buying Up with 5 gold ingots
profile.png|Your profit, open positions and last trades
billboard.png|A win announced in chat, with the gold in the hotbar
EOF
  echo "Added $order screenshots."
fi

# The version, unless it's already there.
versions="$(modrinth GET "/project/$id/version")"
if [ "$(jq --arg v "$version" '[.[] | select(.version_number == $v)] | length' <<<"$versions")" != 0 ]; then
  note "Polymarket Prediction Market $version is already on Modrinth."
else
  data="$(jq -n --arg v "$version" --arg id "$id" --arg tag "$tag" --argjson games "$game_versions" '{
    name: "Polymarket Prediction Market \($v)", version_number: $v, changelog: "Released with Puma Launcher \($tag).",
    dependencies: [], game_versions: $games, loaders: ["forge"], version_type: "release",
    featured: true, status: "listed", project_id: $id, file_parts: ["file"], primary_file: "file"
  }')"
  modrinth POST /version --form-string "data=$data" -F "file=@$jar;type=application/java-archive" >/dev/null
  note "Uploaded Polymarket Prediction Market $version to Modrinth."
fi

# A draft goes to Modrinth's moderators.
project="$(modrinth GET "/project/$id")"
status="$(jq -r .status <<<"$project")"
if [ "$status" = draft ]; then
  modrinth PATCH "/project/$id" -H 'Content-Type: application/json' --data '{"status": "processing"}' >/dev/null
  status=processing
fi
case "$status" in
  approved) note "https://modrinth.com/mod/$slug is public: Aternos can install it." ;;
  processing) note "https://modrinth.com/mod/$slug is waiting for Modrinth's review. Aternos lists it once it's approved." ;;
  *)
    echo "::warning::The project is \"$status\" on Modrinth."
    note "https://modrinth.com/mod/$slug is \"$status\" on Modrinth: open the project page to see why."
    ;;
esac
