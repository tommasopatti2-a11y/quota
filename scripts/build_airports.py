"""Genera app/src/data/airports.json (elenco compatto aeroporti IATA) dal pacchetto airportsdata.

Uso: pip install airportsdata && python scripts/build_airports.py
Formato: {"airports": [[IATA, nome, città, paese ISO2], ...],
          "cities":   [[codice città, nome, paese ISO2, [IATA aeroporti]], ...]}
Le città (codici metropolitani IATA, es. ROM, LON) permettono una sola ricerca su
tutti gli aeroporti della città. Si escludono quelle il cui codice coincide con
un aeroporto (es. IST), perché la ricerca sarebbe ambigua.
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
    codici = {r[0] for r in rows}
    cities = []
    for code, c in sorted(airportsdata.load_iata_macs().items()):
        scali = sorted(a for a in c["airports"] if a in codici)
        if code in c["airports"] or len(scali) < 2:
            continue
        cities.append([code, c["name"], c["country"], scali])
    OUT.write_text(json.dumps({"airports": rows, "cities": cities}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(rows)} aeroporti, {len(cities)} città → {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
