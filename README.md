# Parkeren Groningen: live vrije parkeerplaatsen op de kaart

**Zie direct op de kaart waar je in Groningen nog kunt parkeren, en hoe actueel die informatie is.**

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Leaflet](https://img.shields.io/badge/Leaflet-OpenStreetMap-199900?logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](#docker)
[![Open data](https://img.shields.io/badge/data-open%20data-0f172a)](#databronnen)

Een lichte webapp die de **actuele parkeerbezetting in Groningen** toont: het aantal vrije plaatsen in de parkeergarages en op de P+R-terreinen, op één kaart.

- **Parkeergarages:** Forum, Damsterdiep, Boterdiep, Circus, Euroborg, Station Europapark en de Q-Park-garages Westerhaven, Rademarkt, Ossenmarkt, Museum Centrum en Oosterpoort.
- **P+R-terreinen:** Hoofdstation, Kardinge, Haren, Hoogkerk, Reitdiep en Meerstad.
- **Alle andere openbare parkeergarages en parkeerterreinen** in de gemeente Groningen, zoals UMCG, Martini Ziekenhuis, MartiniPlaza, Sontplein, Zernike en Haren Station. Hiervan is geen live bezetting beschikbaar; de kaart toont de vaste gegevens.

De kaart ververst automatisch. Per locatie zie je ook een trendanalyse: loopt de garage vol, en hoe druk is het normaal rond dit tijdstip? Er zijn geen accounts, geen advertenties en geen verzonnen cijfers. Alles komt uit open data.

<p align="center">
  <img src="docs/kaart-desktop.png" alt="Parkeren Groningen: kaart van de binnenstad met het aantal vrije parkeerplaatsen per parkeergarage" width="72%">
  &nbsp;
  <img src="docs/infovenster-mobiel.png" alt="Informatievenster van P+R Hoofdstation op een smartphone, met vrije plaatsen en bron-update-tijd" width="22%">
</p>

> **English:** Live map of available parking spaces in Groningen, the Netherlands. It covers municipal parking garages, Q-Park garages and park-and-ride (P+R) sites, with per-location trend analysis. Data comes from parkeren050.nl, RDW open parking data and Groningen Bereikbaar. The app is built with React, Leaflet/OpenStreetMap and a dependency-free Node.js backend, and is ready for Docker.

---

## Wat je ziet

Elke marker toont direct het aantal vrije plaatsen. Je hoeft er niet op te klikken.

| Marker | Betekenis |
| --- | --- |
| 🟢 **Groen** | Meer dan 50 plaatsen vrij |
| 🟠 **Oranje** | 1 tot en met 50 plaatsen vrij |
| 🔴 **Rood** | Vol |
| ⚪ **Grijs met –** | De bron geeft geen telling |
| ⚪ **Grijs met 🕒** | Laatst bekende waarde, mogelijk niet actueel |
| ◯ **Kleine witte P** | Parkeerlocatie zonder live bezetting. Alleen vaste gegevens: type, capaciteit, betaald of gratis, exploitant. |

- Een marker met **P** is een parkeergarage, een marker met **P+R** een P+R-terrein.
- Klik op een marker voor het informatievenster. Daarin staan het adres, de vrije plaatsen (met capaciteit als die bekend is), het tarief, de bron en de tijden. Er is ook een knop om te navigeren met Google Maps.
- In het informatievenster staat ook een **trendanalyse** per locatie, zie [Trendanalyse](#trendanalyse).
- De kaart opent op de binnenstad. Zoom uit om de P+R-terreinen aan de rand van de stad te zien. Parkeerterreinen zonder live data verschijnen pas vanaf zoomniveau 14, zodat de kaart rustig blijft.
- De gegevens verversen **automatisch elke 60 seconden** zonder dat de pagina herlaadt, en direct wanneer je terugkeert naar het tabblad. Met de knop rechtsboven ververs je handmatig.
- Alle tijden staan in de tijdzone Europe/Amsterdam.

---

## Snel starten

Je hebt **Node.js 20 of hoger** nodig.

```bash
npm install
npm run dev
```

Open daarna <http://localhost:5173>. De API draait mee in de Vite-ontwikkelserver, dus je hebt één commando nodig.

### Productie

```bash
npm run build
npm start                    # http://localhost:3000
```

Wil je een andere poort? Gebruik dan `PORT=3050 npm start`. In PowerShell is dat `$env:PORT=3050; npm start`.

### Docker

```bash
docker build -t parkeren-groningen .
docker run -p 3000:3000 -v parkeren-data:/app/data parkeren-groningen
```

Het volume `parkeren-data` bewaart de historie voor de trendanalyse, ook bij updates van de container. Het image is meertraps opgebouwd. Het runtime-image bevat alleen `server/` en de gebouwde frontend, zonder `node_modules`. Een healthcheck draait op `/healthz`.

---

## Databronnen

Alle cijfers komen live uit openbare bronnen. Er is geen mock- of voorbeelddata.

| Bron | Locaties | Update-tijd van de bron | Hoe actueel |
| --- | --- | --- | --- |
| [parkeren050.nl](https://www.parkeren050.nl/parkeren-groningen) | 6 gemeentelijke garages: Forum, Damsterdiep, Boterdiep, Circus, Euroborg, Station Europapark | ✗ | ✅ Live, verandert van minuut tot minuut |
| [RDW open parkeerdata](https://npropendata.rdw.nl/parkingdata/v2/) | P+R Hoofdstation | ✓ | ✅ Live, met tijdstempel van de bron |
| [Groningen Bereikbaar](https://kaart.groningenbereikbaar.nl) | 7 P+R-terreinen: Haren 1 en 2, Reitdiep, Kardinge, Hoogkerk 1 en 2, Meerstad | ✗ | 🟡 Ongeveer elke 16 minuten bijgewerkt |
| [Groningen Bereikbaar](https://kaart.groningenbereikbaar.nl) | 5 Q-Park-garages: Westerhaven, Museum Centrum, Rademarkt, Ossenmarkt, Oosterpoort | ✗ | ⚠️ Lijkt niet actueel, zie hieronder |

### Hoe de data wordt opgehaald

- **parkeren050.nl** heeft geen API. De bezetting staat server-side in de HTML (`<p class="available-spaces">158 plaatsen vrij</p>` of `VOL`). Een kleine scraper leest de overzichtspagina. Daar komen ook de namen, adressen, tarieven en openingstijden vandaan.
- **RDW (SPDP v2)** is de landelijke open parkeerdata. In Groningen is P+R Hoofdstation de enige locatie met openbare live data. De live-feeds van de Q-Park-garages staan er ook, maar zijn afgeschermd (`limitedAccess`, HTTP 401).
- **Groningen Bereikbaar** gebruikt een openbare GeoJSON-API (`/api/maps/1.json`) achter de "Slimme Kaart". Die geeft per locatie de capaciteit en het aantal beschikbare plekken, maar geen tijdstempel.

### Bevindingen over de actualiteit

Gemeten op 10 oktober 2026:

- **P+R-terreinen (Groningen Bereikbaar):** de waarden veranderden om 12:30:50 en 12:46:55, dus ongeveer elke 16 minuten. Een getoonde waarde kan tot zo'n kwartier oud zijn.
- **Q-Park-garages (Groningen Bereikbaar):** alle vijf de waarden bleven van 12:22 tot minstens 16:44 exact gelijk. Dat is meer dan vier uur, op een zaterdag in de binnenstad. Dezelfde bron meldde voor P+R Hoofdstation 146 van de 146 plaatsen vrij, terwijl de RDW tegelijkertijd 126 tot 128 vrij gaf. Deze cijfers zijn dus vrijwel zeker niet live. De app markeert ze automatisch als verouderd (zie hieronder).
- **Zonder live data:** UMCG, Martini Ziekenhuis, MartiniPlaza en andere locaties publiceren geen openbare bezetting. Ze staan wel op de kaart, via de catalogus hieronder.

### Catalogus: alle openbare parkeerlocaties

Naast de 19 locaties met live bezetting toont de kaart alle andere openbare parkeerlocaties in de gemeente Groningen. Bij de laatste update waren dat 68 extra locaties. De lijst wordt zo samengesteld:

| Stap | Bron | Wat |
| --- | --- | --- |
| 1 | [OpenStreetMap](https://www.openstreetmap.org) via Overpass | Alle objecten `amenity=parking` binnen de gemeente Groningen, ongeveer 1400 stuks |
| 2 | Filter | Weg vallen locaties die niet openbaar zijn (`private`, `customers`, `permit`) en parkeerstroken langs de weg. Over blijven garages, P+R-terreinen, terreinen die expliciet openbaar of betaald zijn, en terreinen met een naam. Naamloze vlakken kleiner dan 1500 m² met minder dan 50 plaatsen vallen ook af. |
| 3 | [RDW-registraties](https://npropendata.rdw.nl/parkingdata/v2/) | Aanvulling met nog geldige registraties die niet in OSM staan, zoals Garage Centrum, Martini Ziekenhuis en MartiniPlaza. Bij deze locaties staat de registratiedatum. |
| 4 | Ontdubbelen | Locaties op dezelfde plek of met dezelfde naam worden samengevoegd. Locaties die al live op de kaart staan, worden niet nog eens toegevoegd; hun ontbrekende capaciteit wordt wel aangevuld vanuit OSM. |
| 5 | [PDOK Locatieserver](https://www.pdok.nl/introductie/-/article/pdok-locatieserver) | Dichtstbijzijnd adres, zodat naamloze terreinen een herkenbare naam krijgen ("Parkeerterrein Sontplein") |

De server ververst de catalogus elke 24 uur en bewaart hem in `data/catalog.json`. Lukt verversen niet, bijvoorbeeld omdat Overpass overbelast is, dan blijft de vorige lijst staan. Bij de eerste start gebruikt de server de meegeleverde momentopname `server/catalog-snapshot.json`. Die ververs je met:

```bash
npm run update-catalog
```

Kaartgegevens © OpenStreetMap-bijdragers, beschikbaar onder de [ODbL](https://www.openstreetmap.org/copyright).

---

## Hoe actueel is wat je ziet?

De app laat nooit onze eigen controletijd door voor de update-tijd van de bron. Per locatie toont het informatievenster:

| Veld | Betekenis |
| --- | --- |
| **Laatst gecontroleerd** | Wanneer onze server de stand voor het laatst met succes ophaalde |
| **Update-tijd bron** | De tijd die de bron zelf meegeeft (alleen bij de RDW). Anders staat er "niet gepubliceerd door bron". |
| **Waarde ongewijzigd sinds** | Onze eigen waarneming van wanneer de waarde voor het laatst veranderde. Dit loopt via de historie ook over herstarts heen. "of eerder" betekent dat de waarde al zo was bij de eerste meting. |
| **Bron** | Link naar de herkomst van het cijfer |

Een marker wordt **grijs met een klokje** zodra één van deze dingen geldt:

1. de laatste geslaagde controle is ouder dan 5 minuten (`STALE_AFTER_SECONDS`);
2. de update-tijd van de bron is ouder dan 30 minuten (`SOURCE_STALE_AFTER_SECONDS`);
3. **de bron staat stil:** in een groep locaties zonder update-tijd van de bron is al 30 minuten geen enkele waarde veranderd (`FROZEN_AFTER_SECONDS`).

De stilstand-detectie gebruikt de historie en werkt dus ook direct na een herstart. Ze werkt per groep, bijvoorbeeld "Q-Park-garages" en "P+R-terreinen". Binnen één bron kan het ene deel live zijn en het andere niet. Zo wordt Q-Park als verouderd gemarkeerd, terwijl de P+R-terreinen uit dezelfde bron gewoon in kleur blijven.

Lukt het ophalen niet, dan blijft de laatst bekende waarde staan. De header en het informatievenster melden dan welke bron niet bereikbaar is.

---

## Trendanalyse

Per locatie toont het informatievenster een grafiek van de vrije plaatsen over **3 uur, 24 uur of 7 dagen**. Beweeg over de grafiek of tik erop voor de exacte waarde op een tijdstip. Erboven staat een korte analyse:

| Onderdeel | Hoe het wordt berekend |
| --- | --- |
| **Richting** (loopt vol, loopt leeg of stabiel) | Lineaire regressie over de metingen van het laatste halfuur. "Stabiel" betekent minder dan 6 plaatsen per uur, of minder dan 2% van de capaciteit. |
| **Tempo** | Dezelfde regressie, uitgedrukt in plaatsen per uur |
| **Vol rond …** | Alleen bij duidelijk vollopen, en alleen als de locatie bij dit tempo binnen 3 uur vol is. Dit is een schatting en wordt ook zo genoemd. |
| **Afgelopen uur** | Verschil tussen nu en 60 minuten geleden |
| **Normaal rond dit tijdstip** | Gemiddelde rond hetzelfde tijdstip (±30 min) op eerdere dagen. Verschijnt pas als er minstens 2 eerdere dagen met metingen zijn. |
| **Min, gemiddelde, max** | Over de gekozen periode |

### Waar de historie vandaan komt

- De server **meet zelf elke minuut** (`POLL_SECONDS`), ook als niemand de site bekijkt. De historie bevat dus geen gaten door gebrek aan bezoekers.
- Een meting wordt alleen opgeslagen als de waarde verandert, plus elke 5 minuten een controlepunt. Zo blijft het bestand klein.
- Er is geen database. De metingen staan in het geheugen en worden elke 5 minuten (en bij het afsluiten) weggeschreven naar `data/history.json` (`HISTORY_FILE`). Na een herstart gaat de historie verder waar hij was. Metingen ouder dan `HISTORY_DAYS` (standaard 7) worden opgeruimd.
- Mislukt het ophalen langer dan 12 minuten, dan zie je een **gat** in de lijn. De app vult niets in.
- De historie begint bij de eerste start van de server. Onder de grafiek staat "eigen metingen sinds …". De weergave van 7 dagen en "normaal rond dit tijdstip" worden dus pas na een paar dagen zinvol.

### Eerlijkheid

- Is de huidige stand niet actueel (verouderd, of uit een groep die stilstaat zoals nu de Q-Park-garages), dan geeft de app **geen richting, tempo of schatting**. De grafiek toont dan alleen de waarden zoals de bron ze meldde, met een melding erbij.
- Voor de P+R-terreinen uit Groningen Bereikbaar, die ongeveer elke 16 minuten worden bijgewerkt, is de richting over het laatste halfuur grover dan voor de live bronnen.

---

## Configuratie

Alle instellingen zijn omgevingsvariabelen van de server.

| Variabele | Standaard | Betekenis |
| --- | --- | --- |
| `PORT` | `3000` | Poort van de server |
| `THRESHOLD_LOW` | `50` | Groen boven deze waarde, oranje van 1 tot en met deze waarde, rood bij 0 |
| `CACHE_TTL_SECONDS` | `30` | Hoe lang een opgehaalde stand wordt hergebruikt |
| `FETCH_TIMEOUT_SECONDS` | `10` | Time-out per bron |
| `STALE_AFTER_SECONDS` | `300` | Verouderd als de laatste geslaagde controle ouder is dan dit |
| `SOURCE_STALE_AFTER_SECONDS` | `1800` | Verouderd als de update-tijd van de bron ouder is dan dit |
| `FROZEN_AFTER_SECONDS` | `1800` | Een groep zonder één enkele wijziging in deze tijd heet "mogelijk niet actueel" |
| `POLL_SECONDS` | `60` | Hoe vaak de server zelf meet, voor de historie |
| `HISTORY_DAYS` | `7` | Hoe lang de historie wordt bewaard |
| `HISTORY_FILE` | `data/history.json` | Bestand voor de historie. Leeg laten betekent alleen in het geheugen. |
| `SOURCE_URL` | `https://www.parkeren050.nl/parkeren-groningen` | Bronpagina van parkeren050.nl |

Twee instellingen gelden tijdens de build:

| Variabele | Standaard | Betekenis |
| --- | --- | --- |
| `VITE_TILE_URL` | OpenStreetMap-tegels | Eigen tegelserver |
| `VITE_TILE_ATTRIBUTION` | OpenStreetMap-bijdragers | Bronvermelding bij de kaart |

Voorbeeld:

```bash
docker run -p 3000:3000 -e THRESHOLD_LOW=30 parkeren-groningen
```

---

## Hoe het werkt

```
 Browser ──(elke 60 s)──▶ /api/parking ──▶ parking.js ◀──(elke 60 s)── eigen meting van de server
 Browser ──(bij openen)──▶ /api/history ─▶ history.js ──▶ data/history.json
                                             │  cache per bron (30 s), één ophaalactie tegelijk
                                             ├─▶ sources/parkeren050.js         HTML-scraper
                                             ├─▶ sources/rdw.js                 JSON
                                             └─▶ sources/groningenBereikbaar.js GeoJSON
```

- **Caching:** hoeveel bezoekers er ook zijn, elke bron wordt hooguit één keer per `CACHE_TTL_SECONDS` opgehaald. Gelijktijdige verzoeken delen één ophaalactie.
- **Fouttolerantie:** elke bron heeft een eigen cache, time-out en foutstatus. Valt één bron uit, dan blijven de andere werken.
- **Minimale dependencies:** de server gebruikt alleen ingebouwde Node-modules. De frontend gebruikt React, Leaflet en Tailwind CSS.

### Projectstructuur

```
server/
  index.js                    productieserver: API en statische bestanden
  parking.js                  combineert de bronnen: cache, versheid, stilstand-detectie, eigen metingen
  history.js                  historie (JSON-bestand) en trendanalyse
  catalog.js                  catalogus van alle openbare parkeerlocaties (OSM, RDW, PDOK)
  catalog-snapshot.json       meegeleverde momentopname van de catalogus
  update-catalog.js           npm run update-catalog
  config.js                   instellingen en fetch met time-out
  sources/
    parkeren050.js            gemeentelijke garages (scraper)
    rdw.js                    P+R Hoofdstation (RDW)
    groningenBereikbaar.js    Q-Park en P+R-terreinen
src/
  App.jsx                     verversen, foutafhandeling, klokcorrectie
  ParkingMap.jsx              Leaflet-kaart en markers
  Header.jsx                  zwevende header met verversstatus
  GarageCard.jsx              informatievenster
  TrendPanel.jsx              trendanalyse en grafiek
  Legend.jsx                  legenda
  lib.js                      kleuren, versheid, tijdnotatie
```

### API

`GET /api/parking` geeft alle locaties met hun bronnen en versheid terug:

```jsonc
{
  "serverTime": "2026-10-10T14:44:42.000Z",
  "thresholds": { "low": 50 },
  "sources":   [{ "id": "rdw", "name": "RDW open parkeerdata", "lastSuccessAt": "…", "error": null }],
  "groups":    [{ "id": "groningen-bereikbaar:garage:Q-Park", "label": "Q-Park-garages (Groningen Bereikbaar)", "frozen": true }],
  "locations": [{
    "id": "pr-hoofdstation", "name": "P+R Hoofdstation", "kind": "pr",
    "lat": 53.211582, "lng": 6.560898,
    "free": 125, "capacity": 146, "status": "available",
    "lastCheckedAt": "…", "sourceUpdatedAt": "…", "valueSince": "…"
  }]
}
```

`GET /api/history?id=<locatie>&range=3h|24h|7d` geeft de trendanalyse van één locatie terug:

```jsonc
{
  "id": "damsterdiep", "range": "3h", "reliable": true,
  "historySince": "…", "samples": 36,
  "points": [["2026-10-10T13:50:00.000Z", 96], ["…", null]],   // null = gat
  "stats": { "min": 44, "avg": 85, "max": 137 },
  "current": 79, "change15": -13, "change60": -13,
  "ratePerHour": -17, "direction": "filling",                  // filling | emptying | stable
  "fullAt": null,                                              // schatting, alleen binnen 3 uur
  "typical": { "value": 146, "days": 7 }                       // null bij minder dan 2 dagen
}
```

---

## Bekende beperkingen

- **Q-Park-cijfers:** die komen uit een bron die niet actueel lijkt (zie [Bevindingen over de actualiteit](#bevindingen-over-de-actualiteit)). De app markeert ze automatisch als verouderd. De echte live-feed van Q-Park is niet openbaar.
- **Scraper:** als parkeren050.nl de opbouw van de pagina wijzigt, kan het uitlezen stoppen. De header meldt dan "parkeren050.nl niet bereikbaar" en het informatievenster noemt de oorzaak ("geen garages gevonden in de bron"). De laatst bekende waarden blijven staan en worden na 5 minuten als verouderd gemarkeerd.
- **Kaarttegels:** de standaard OpenStreetMap-tegelserver is bedoeld voor licht gebruik. Gebruik bij veel bezoekers een eigen of commerciële tegelserver via `VITE_TILE_URL`.
- **Catalogus:** de selectie van openbare parkeerterreinen hangt af van hoe goed ze in OpenStreetMap zijn ingevoerd. Een ontbrekende of foute locatie verbeter je het beste in OpenStreetMap zelf; na de volgende dagelijkse verversing staat hij goed op de kaart.
- **Euroborg en P+R Meerstad:** de bronnen gaven tijdens het testen geen telling voor deze locaties, dus hun markers zijn grijs met "–".
