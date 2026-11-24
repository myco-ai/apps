#!/usr/bin/env python3
"""Deterministic archives using the layout understood by old Hubs."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OFFICIAL = ROOT / "dist/official"
OUTPUT = ROOT / "dist/apps"


def pack(name, apps):
    with zipfile.ZipFile(OUTPUT / name, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for app in sorted(apps):
            for source in sorted((OFFICIAL / app).rglob("*")):
                relative = source.relative_to(OFFICIAL)
                if source.is_file() and not any(p.startswith(".") for p in relative.parts):
                    if source.is_symlink():
                        raise ValueError(f"Symlink in package: {relative}")
                    info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    archive.writestr(info, source.read_bytes(), compresslevel=9)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    names = sorted(p.name for p in OFFICIAL.iterdir() if (p / "myco.json").is_file())
    builtin = json.loads((ROOT / "builtin.json").read_text())
    if not names or not set(builtin) <= set(names):
        raise ValueError("Build all apps before packaging; every builtin must be present")
    for app in names:
        manifest = json.loads((OFFICIAL / app / "myco.json").read_text())
        for file in [manifest.get("entry", "index.html"), manifest.get("agent", "agent.md"), manifest.get("sample", "sample.json"), "locales.json", "icon.svg", "shots/1.webp", "shots/1.dark.webp"]:
            if not (OFFICIAL / app / file).is_file():
                raise ValueError(f"Incomplete app: {app}/{file}")
    pack("apps.zip", names)
    pack("builtin.zip", builtin)
    for name, source in [("app-locales.json", ROOT / "templates/localization/app-locales.json"), ("builtin.json", ROOT / "builtin.json")]:
        (OUTPUT / name).write_bytes(source.read_bytes())
    checksums = []
    for name in ["apps.zip", "builtin.zip", "app-locales.json", "builtin.json"]:
        checksums.append(f"{hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()}  {name}\n")
    (OUTPUT / "SHA256SUMS").write_text("".join(checksums))
    print(f"Packed {len(names)} apps, {len(builtin)} builtin apps")


if __name__ == "__main__":
    main()
