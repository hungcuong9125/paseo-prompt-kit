#!/usr/bin/env bash
# file-size-audit.sh — line-count distribution of production source files.
#
# Measurement input for framework/module-boundaries.md. Reports a distribution
# and the largest files; it does not judge. A large cohesive file is not a
# finding, and this script cannot tell the difference — read the file.
#
# Usage:
#   framework/tools/file-size-audit.sh [repo-path] [options]
#
#   --top N            list the N largest files (default 25)
#   --exclude REGEX    extended-regex of paths to drop, repeatable
#   --csv              emit "lines<TAB>path", sorted desc, nothing else
#
# Excluded by default: tests, generated, vendored, build output, node_modules,
# migrations, testdata, mocks, examples, *.d.ts, *.pb.go, *_gen.go, and
# fixture/snapshot/golden/seed files by name.
set -euo pipefail

REPO="."
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then REPO="$1"; shift; fi

TOP=25; CSV=0; USER_EXCL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --top)     TOP="$2"; shift 2;;
    --exclude) USER_EXCL+=("$2"); shift 2;;
    --csv)     CSV=1; shift;;
    -h|--help) sed -n '2,17p' "$0"; exit 0;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done

cd "$REPO"

EXT_RE='\.(go|ts|tsx|js|jsx|mjs|cjs|py|rs|rb|java|kt|swift|php|c|h|cc|cpp|hpp|cs|vue|svelte|sql|sh|bash|lua|ex|exs|scala|dart)$'
DIR_RE='(^|/)(node_modules|vendor|third_party|dist|build|out|target|\.next|\.venv|venv|__pycache__|\.git|coverage|gen|generated|migrations|testdata|fixtures|mocks|__mocks__|examples?|upstreams)/'
TEST_RE='(_test\.(go|py|rb|ts|js)$|\.(test|spec)\.(ts|tsx|js|jsx|mjs)$|(^|/)test_[^/]*\.py$|(^|/)(tests?|spec|e2e|__tests__)/)'
GEN_RE='(\.pb(\.gw)?\.go$|_gen\.go$|\.gen\.(go|ts|tsx)$|\.g\.dart$|_generated\.|\.min\.(js|css)$|\.d\.ts$)'
FIX_RE='((^|/)|_)(fixture|fixtures|snapshot|snapshots|golden|seed|seeds)(_[^/]*)?\.[a-z]+$'

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LIST=$(git ls-files)
else
  LIST=$(find . -type f | sed 's|^\./||')
fi

FILES=$(printf '%s\n' "$LIST" | grep -Ei "$EXT_RE" | grep -Ev "$DIR_RE" \
  | grep -Ev "$TEST_RE" | grep -Ev "$GEN_RE" | grep -Ev "$FIX_RE" || true)
for ex in ${USER_EXCL+"${USER_EXCL[@]}"}; do
  FILES=$(printf '%s\n' "$FILES" | grep -Ev "$ex" || true)
done
[ -z "$FILES" ] && { echo "no production source files matched"; exit 0; }

DATA=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 wc -l 2>/dev/null \
  | grep -v ' total$' | awk '{n=$1; $1=""; sub(/^ /,""); print n"\t"$0}' | sort -rn)

if [ "$CSV" = 1 ]; then printf '%s\n' "$DATA"; exit 0; fi

FILE_N=$(printf '%s\n' "$DATA" | wc -l | tr -d ' ')
LINE_N=$(printf '%s\n' "$DATA" | awk -F'\t' '{s+=$1} END{print s}')
echo "repo:  $(pwd)"
echo "files: $FILE_N   lines: $LINE_N   mean: $((LINE_N / FILE_N))"
echo
echo "== bands (framework/module-boundaries.md) =="
printf '%s\n' "$DATA" | awk -F'\t' '
  {t++; n=$1
   if(n<300)a++; else if(n<500)b++; else if(n<800)c++; else if(n<1200)d++; else e++}
  END{
    printf "  <300      %5d  %5.1f%%  no signal\n",              a+0, 100*(a+0)/t
    printf "  300-499   %5d  %5.1f%%  no signal\n",              b+0, 100*(b+0)/t
    printf "  500-799   %5d  %5.1f%%  cohesion check before adding\n", c+0, 100*(c+0)/t
    printf "  800-1199  %5d  %5.1f%%  no unrelated behaviour added\n",  d+0, 100*(d+0)/t
    printf "  >=1200    %5d  %5.1f%%  recorded justification or split plan\n", e+0, 100*(e+0)/t
  }'
echo
echo "== $TOP largest =="
printf '%s\n' "$DATA" | head -n "$TOP" | awk -F'\t' '{printf "  %6d  %s\n", $1, $2}'
echo
echo "== by area (files / lines / largest) =="
printf '%s\n' "$DATA" | awk -F'\t' '
  {split($2,p,"/"); k=(p[2]==""?".":p[1]"/"p[2])
   n[k]++; s[k]+=$1; if($1>m[k]) m[k]=$1}
  END{for(k in s) printf "  %5d  %8d  %6d  %s\n", n[k], s[k], m[k], k}' | sort -k2 -rn
