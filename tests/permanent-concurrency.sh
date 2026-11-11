#!/usr/bin/env bash
set -euo pipefail
# Separate connections race for the same profile lock, using different cells.
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
for x in 10 11; do
  psql -At -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false); select public.place_pixel($x,1,'#ef4444')->>'success';" > "$test_dir/$x" &
done
wait
python3 - "$test_dir" <<'PY'
from pathlib import Path
import sys
results=[p.read_text().strip().splitlines()[-1] for p in Path(sys.argv[1]).iterdir()]
assert sorted(results)==['false','true'], results
PY
