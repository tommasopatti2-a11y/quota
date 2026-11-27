"""Lettura dei risultati di Google Voli con un browser vero (Chromium via Playwright).

Perché un browser: la pagina che Google invia subito contiene spesso pochi voli
o nessuno; il resto arriva poco dopo con una richiesta `GetShoppingResults` fatta
dagli script della pagina. Qui apriamo la pagina come farebbe una persona,
aspettiamo quella risposta e la leggiamo, includendo entrambe le sezioni
("voli migliori" e "altri voli"). Se la richiesta non arriva, usiamo i dati già
presenti nella pagina.
"""

from __future__ import annotations

import json
import os
import re
import time

from fast_flights.model import Flights
from fast_flights.parser import parse_js
from selectolax.lexbor import LexborHTMLParser

RPC = "GetShoppingResults"
TIMEOUT_RISULTATI_MS = 30_000
ATTESA_DOPO_RISULTATI_MS = 1_500  # dopo l'ultima risposta con voli
ATTESA_MAX_MS = 15_000  # se non arriva nessun volo
POLL_MS = 300
MAX_DEBUG = 12  # pagine salvate per esecuzione quando non si trovano voli


class GoogleBloccato(Exception):
    """Google ha risposto con una pagina di blocco o vuota."""


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
def voli_da_payload(payload: list) -> list[Flights]:
    """Voli di entrambe le sezioni del payload (2 = migliori, 3 = altri)."""
    voli: list[Flights] = []
    for sezione in (2, 3):
        if len(payload) > sezione and payload[sezione] and payload[sezione][0]:
            # parse_js della libreria legge solo payload[3][0]: gli passiamo una
            # copia del payload con la sezione desiderata in quella posizione.
            copia = list(payload)
            copia[3] = [payload[sezione][0]]
            # Alcune risposte non hanno i metadati (compagnie/alleanze) che parse_js
            # legge in payload[7][1]: li sostituiamo con elenchi vuoti.
            try:
                copia[7][1][0], copia[7][1][1]  # noqa: B018
            except (IndexError, TypeError):
                copia[7:8] = [[None, [[], []]]]
            voli += parse_js("data:" + json.dumps(copia) + ",x")
    return voli


def payload_da_rpc(testo: str) -> list[list]:
    """Estrae i payload dalla risposta batchexecute di GetShoppingResults."""
    payloads = []
    for riga in testo.splitlines():
        riga = riga.strip()
        if not riga.startswith("[["):
            continue
        try:
            blocchi = json.loads(riga)
        except json.JSONDecodeError:
            continue
        for b in blocchi:
            if isinstance(b, list) and len(b) > 2 and b[0] == "wrb.fr" and isinstance(b[2], str):
                payloads.append(json.loads(b[2]))
    return payloads


def payload_da_html(html: str) -> list | None:
    nodo = LexborHTMLParser(html).css_first(r"script.ds\:1")
    if nodo is None:
        return None
    testo = nodo.text()
    if "data:" not in testo:
        return None
    dati = testo.split("data:", 1)[1].rsplit(",", 1)[0]
    if dati.endswith("errorHasStatus: true"):
        return []
    return json.loads(dati)


def _chiave(f: Flights) -> tuple:
    primo = f.flights[0] if f.flights else None
    return (
        f.price,
        tuple(f.airlines),
        tuple((s.from_airport.code, s.to_airport.code) for s in f.flights),
        tuple(primo.departure.time) if primo else None,
    )


def unisci(voli: list[Flights]) -> list[Flights]:
    visti, out = set(), []
    for f in voli:
        k = _chiave(f)
        if k not in visti:
            visti.add(k)
            out.append(f)
    return out


# ---------------------------------------------------------------------------
# Browser
# ---------------------------------------------------------------------------
class GoogleVoli:
    """Un unico browser riusato per tutte le ricerche di una rilevazione."""

    def __enter__(self) -> "GoogleVoli":
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self.diagnosi = ''
        self._debug_salvati = 0
        opzioni = {}
        # In locale si può indicare un Chromium già installato.
        if os.environ.get("CHROMIUM_PATH"):
            opzioni["executable_path"] = os.environ["CHROMIUM_PATH"]
        self._browser = self._pw.chromium.launch(**opzioni)
        self._ctx = self._browser.new_context(
            locale="it-IT",
            timezone_id="Europe/Rome",
            viewport={"width": 1280, "height": 900},
        )
        # Nota: non bloccare immagini o font. Senza di essi Google risponde spesso
        # con un ErrorResponse (codice 13) invece dei voli.
        return self

    def __exit__(self, *exc) -> None:
        try:
            self._ctx.close()
            self._browser.close()
        finally:
            self._pw.stop()

    def cerca(self, url: str, accetta_parziale: bool = True) -> list[Flights]:
        """Apre la pagina dei risultati e restituisce tutti i voli trovati.

        Google può inviare più risposte GetShoppingResults (la prima a volte vuota):
        le raccogliamo tutte e aspettiamo finché arrivano voli, al massimo
        ATTESA_MAX_MS. Se alla fine non ci sono voli e QUOTA_DEBUG_DIR è impostata,
        salviamo pagina, screenshot e risposte per capire cosa è successo.

        Se Google rifiuta la richiesta ma la pagina contiene già qualche volo, il
        risultato è probabilmente incompleto: con accetta_parziale=False si solleva
        GoogleBloccato per ritentare.
        """
        page = self._ctx.new_page()
        risposte: list = []
        page.on("response", lambda r: risposte.append(r) if RPC in r.url else None)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_RISULTATI_MS)
            self._consenso(page)
            if "/sorry/" in page.url:
                raise GoogleBloccato("Google ha chiesto una verifica anti-robot")

            testi: dict[int, str] = {}
            con_dati = 0  # risposte che contengono un payload
            voli: list[Flights] = []
            errori: list[str] = []
            inizio = time.monotonic()
            ultimo_arrivo = inizio
            while True:
                page.wait_for_timeout(POLL_MS)
                for i, r in enumerate(list(risposte)):
                    if i in testi:
                        continue
                    try:
                        testi[i] = r.text()
                    except Exception:  # noqa: BLE001 - corpo non ancora disponibile
                        continue
                    ultimo_arrivo = time.monotonic()
                    payloads = payload_da_rpc(testi[i])
                    con_dati += bool(payloads)
                    for p in payloads:
                        try:
                            voli += voli_da_payload(p)
                        except Exception as e:  # noqa: BLE001 - un blocco illeggibile non deve far perdere gli altri
                            errori.append(f"{type(e).__name__}: {e}")
                trascorso = time.monotonic() - inizio
                if voli and time.monotonic() - ultimo_arrivo >= ATTESA_DOPO_RISULTATI_MS / 1000:
                    break  # voli arrivati e nessuna nuova risposta da un po'
                if testi and not con_dati and time.monotonic() - ultimo_arrivo >= ATTESA_DOPO_RISULTATI_MS / 1000:
                    break  # solo risposte senza dati: Google ha rifiutato la ricerca
                if trascorso >= ATTESA_MAX_MS / 1000:
                    break

            html = page.content()
            html_payload = payload_da_html(html)
            if html_payload:
                try:
                    voli += voli_da_payload(html_payload)
                except Exception as e:  # noqa: BLE001
                    errori.append(f"{type(e).__name__}: {e}")

            self.diagnosi = f"{len(testi)} risposte ({', '.join(str(len(t)) for t in testi.values()) or '-'} byte), pagina {len(html)} byte"
            voli = unisci(voli)
            if voli and testi and not con_dati and not accetta_parziale:
                raise GoogleBloccato(f"risposta rifiutata, solo {len(voli)} voli dalla pagina")
            if not voli:
                self._salva_debug(page, url, html, list(testi.values()))
                if html_payload is None and not testi:
                    raise GoogleBloccato(f"pagina senza dati ({len(html)} byte)")
                if testi and not con_dati:
                    # Risposta corta senza payload: tipico limite di frequenza di Google.
                    estratto = re.sub(r"\s+", " ", next(iter(testi.values())))[:160]
                    raise GoogleBloccato(f"risposta senza dati: {estratto}")
                if errori:
                    raise ValueError("risposta di Google non leggibile: " + "; ".join(errori)[:300])
            return voli
        finally:
            page.close()

    def _salva_debug(self, page, url: str, html: str, testi: list[str]) -> None:
        cartella = os.environ.get("QUOTA_DEBUG_DIR")
        if not cartella or self._debug_salvati >= MAX_DEBUG:
            return
        self._debug_salvati += 1
        base = os.path.join(cartella, f"ricerca-{self._debug_salvati:02d}")
        os.makedirs(cartella, exist_ok=True)
        with open(base + ".txt", "w", encoding="utf-8") as f:
            f.write(f"{url}\nURL finale: {page.url}\n{self.diagnosi}\n")
        with open(base + ".html", "w", encoding="utf-8") as f:
            f.write(html)
        for i, t in enumerate(testi):
            with open(f"{base}-risposta{i + 1}.txt", "w", encoding="utf-8") as f:
                f.write(t)
        try:
            page.screenshot(path=base + ".png", full_page=True)
        except Exception:  # noqa: BLE001
            pass

    @staticmethod
    def _consenso(page) -> None:
        """Gestisce l'eventuale pagina di consenso ai cookie (accessi dall'UE)."""
        if "consent." not in page.url:
            return
        for testo in ("Rifiuta tutto", "Reject all", "Accetta tutto", "Accept all"):
            pulsante = page.get_by_role("button", name=testo)
            if pulsante.count():
                pulsante.first.click()
                page.wait_for_load_state("domcontentloaded")
                return

