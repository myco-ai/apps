#!/usr/bin/env bash
# Validate packages using the locked Hub's real parser and record schemas.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
host=${MYCO_HOST_ROOT:-$root/.cache/myco}
module=$(sed -n 's/^module //p' "$host/go.mod")
check=$(mktemp -d "$host/.apps-check.XXXXXX")
trap 'rm -rf "$check"' EXIT
cat > "$check/main.go" <<'GO'
package main
import (
 "encoding/json"
 "fmt"
 "os"
 "HOST_MODULE/internal/templates"
)
func main() {
 list, err := templates.FromDir(os.DirFS(os.Args[1])); if err != nil { panic(err) }
 if len(list) < 4 { panic("empty catalog") }
 for _, app := range list {
  var sample map[string][]map[string]json.RawMessage
  if err := json.Unmarshal(app.Files[app.Manifest.Sample], &sample); err != nil { panic(err) }
  for collection, records := range sample {
   schema, ok := app.Manifest.Data[collection]; if !ok { panic("unknown sample collection: " + collection) }
   for _, record := range records {
    delete(record, "id"); body, _ := json.Marshal(record)
    if err := schema.CheckRecord(collection, string(body)); err != nil { panic(fmt.Sprintf("%s: %v", app.Manifest.ID, err)) }
   }
  }
 }
 fmt.Printf("PASS actual Hub parser and sample schemas: %d apps\n", len(list))
}
GO
python3 - "$check/main.go" "$module" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);p.write_text(p.read_text().replace('HOST_MODULE',sys.argv[2]))
PY
(cd "$host" && go run "$check/main.go" "$root/dist/official")
