"""Genera app/src/data/airports.json (elenco compatto aeroporti IATA) dal pacchetto airportsdata.

Uso: pip install airportsdata && python scripts/build_airports.py
Formato: [[IATA, nome, città, paese ISO2], ...]
"""
import json
from pathlib import Path

import airportsdata

OUT = Path(__file__).resolve().parent.parent / "app" / "src" / "data" / "airports.json"


def main() -> None:
    rows = []
    for code, a in sorted(airportsdata.load("IATA").items()):
        if len(code) != 3 or not code.isalpha():
            continue
        name = (a.get("name") or "").replace(" International Airport", " Intl").replace(" Airport", "")
        rows.append([code.upper(), name.strip(), (a.get("city") or "").strip(), a.get("country") or ""])
    OUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(rows)} aeroporti → {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
