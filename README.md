# Arise RTS 0.3.1

Spillbar, lokal videreutvikling av den tilgjengelige `aetherfront-rts-level-01.zip`-prototypen. Beholder **TypeScript, Babylon.js og Vite**. Dette er spillkoden; prosjektpresentasjonen fra den separate `arise-website.zip` er ikke endret.

## Kjør i VS Code

1. Installer **Node.js 22.18 eller nyere** (gjerne Node.js 24).
2. Pakk ut ZIP-filen og åpne mappen `arise-rts` i VS Code.
3. Åpne terminalen og kjør:

   ```sh
   npm ci
   npm run dev
   ```

4. Åpne adressen Vite skriver ut, normalt **http://127.0.0.1:5173**.
5. Trykk **VELG REGION**. Alle ti regioner kan spilles direkte.

`npm ci` krever internett første gang. Etter installasjon trenger spillet ingen eksterne API-er, kontoer eller bilde- og modellnedlastinger. Utviklingsserveren er bundet til din egen maskin. Ikke åpne `index.html` direkte med dobbeltklikk.

Bygg og test:

```sh
npm test
npm run build
npm run preview
```

`npm run build` kontrollerer TypeScript og lager `dist/` for statisk hosting. `.vscode/tasks.json` inneholder oppgaver for utvikling, test og bygg. Kildekode og låste avhengighetsversjoner er med; `node_modules` er utelatt.

## Visuell oppgradering i 0.3.1

- Alle bygningstypene og rådhuset har fått nye modeller med skråtak, bindingsverk, sokler, vinduskarmer og flere detaljer som viser funksjonen. Markedet har boder og varer; smia har esse og ambolt; havnen har brygge og kran; tårnene har tydeligere våpen og brystvern.
- Bakken har en generert 512 × 512-tekstur for hver region, med gress, jord og grus. Stien går fra startområdet mot den aktuelle regionens rift. Grastuster, småstein og svært grunt geometrisk relieff gir mer overflatestruktur.
- Trærne har stamme, greiner, røtter, ujevne nåletrekranser og noen løvtrær. Høyde og farge varierer. Fargene følger regionen.
- Detaljer med samme materiale samles i færre mesh-batcher. Terrengteksturer gjenbrukes ved retur til et kart. Ingen nye avhengigheter, nedlastede modeller eller eksterne bildelenker.
- `src/art.ts` inneholder de prosedyregenererte modellene og teksturene. Juster dette for videre kunstretning. Geometrisk relieff ligger mellom 0 og omtrent −0,11m; bevegelse og enheter bruker fortsatt det eksisterende plane spilleområdet.

De nye modellene beholder koblingen til riktig enhet ved klikk. Naturdekor blokkerer ikke RTS-ordrer. Kostnader, oppdrag, kampregler og mur-/portkollisjon bruker fortsatt de samme spilldataene som i 0.3.

Testene kontrollerer spillregler, alle byggemodeller, valg av ressurstrær, gyldig geometri og teksturgjenbruk ved regionbytte. 3D-visningen kunne ikke kontrolleres visuelt i testnettleseren, fordi den ikke støtter WebGL. Full visuell kontroll og FPS-måling på vanlig PC gjenstår.

## Nytt i 0.3

- **Brick Wall, Gate, Outpost, Guard Tower og Bomber Tower** med kostnader, byggetid, helse og egne funksjoner.
- **Grunnstatistikk for alle enheter:** nivå, helse, skade, forsvar, bevegelsesfart, angrepsintervall, rekkevidde, sikt/varsling og fraksjon. Forsvar reduserer fysisk skade med et tak på 50%.
- **Vinnie Jonas** på kart 1, med navnemarkør, advarsel, dialog og to valgfrie oppdrag.
- **Fire nye samleressurser:** stein, jernmalm, leire og urter. Aether beholder sitt eget navn og sin egen beholdning.
- **Seks profesjoner** med XP og nivå 1–5, åtte oppskrifter, tidsstyrt crafting og en sekk med brukbare gjenstander.
- Mur og lukket port har faktisk kollisjon. Fiender som blokkeres, angriper hindringen. Bomber Tower gjør områdeskade uten å skade allierte.

Se [SYSTEMS_V03.md](SYSTEMS_V03.md) for forsvarsbygg, oppdragsdesign, oppskrifter, belønninger og begrensninger.

## Styring

- Venstreklikk: velg en helt, tropp eller bygning.
- Høyreklikk: bevegelse, angrep eller innsamling med valgt enhet.
- **1**: helt. **2**: arbeidere. **3**: velg hele hæren (uten arbeidere og fiskebåter).
- **B**: byggemeny når rådhus eller arbeidere er valgt. **R** roterer en mur eller port med 90° under plassering.
- Velg en ferdig **Gate** for å åpne eller lukke den. En åpen port slipper også fiender gjennom.
- **PROFESJONER · HÅNDVERK · SEKK** til venstre åpner oppskrifter og gjenstander. Velg en tropp først for å bruke utstyr eller salve på den.
- På kart 1: klikk **Vinnie Jonas** eller høyreklikk ham med helten valgt for å gå bort og snakke. Helten må være innen 7m for å ta og levere oppdrag.
- **OPPDRAGSJOURNAL** viser sideoppdrag og fremdrift.
- **R**: legg Royal Guard i kø i valgt Barracks.
- **Q**: Rally Cry med helten valgt.
- **WASD / piltaster**: kamera. **Musehjul**: zoom. **Mellomrom**: fokuser helten.
- **P**: pause. **Esc**: avbryt plassering eller lukk dialogen.
- Troppelisten til venstre lar deg velge hver rekrutterte enhet.
- Klikk en militærbygning for å se rekruttering, kostnader, produksjonskø og timer.
- Regionknappen **⌖** øverst åpner kartvelgeren under et oppdrag. Valg av ny region starter den på nytt og erstatter den aktive runden.

## 10 faktiske regionoppsett

Hver region initialiserer et nytt spillkart, med egen seed, terrengpalett, ressursplasseringer, riftposisjon, fiendeplasseringer, rifthelse og bølgetrykk. Dette er ikke bare navn i en meny. Se `REGIONS.md`.

Alle kart bruker foreløpig samme hovedmål: samle 80 tømmer / 50 aether, fullfør en Barracks, tren to Royal Guards og ødelegg riften. Riftens skjold forsvinner når to vakter er ferdigtrent. Dette er ikke ti ferdigskrevne kampanjeoppdrag med egne historier, eskorte, broer eller nye questsystemer. Første oppdrags ønskede lengde på 15–20 minutter er et designmål som ennå ikke er målt i en menneskelig spilletest.

Region 02, 06 og 09 er kystkart. Der finnes sjøfelt i nord, Fish Trap, Dock, Harbor, Fishing Boat og Warship. Landenheter kan ikke gå i sjøen, og båter kan ikke gå på land. Krigsskip kan skyte mot fiender og rift nær kysten. Ingen sjøtransport er implementert.

## Nye bygninger og systemer

**Economic:** Farm, Mill, Mining Camp, Fish Trap, Saw Mill og Market Place.

- Farm: 2 mat/s; én fullført Mill øker dette til 3 mat/s. Flere møller stabler ikke bonusen.
- Fish Trap: 2,5 mat/s i vann på kystkart.
- Mining Camp: utvinner 3 aether/s fra faktiske forekomster innen 10m.
- Saw Mill: utvinner 3 tømmer/s fra faktiske forekomster innen 10m.
- Arbeidere og leirer deler de samme uttømmelige ressursforekomstene.
- Market Place: **kan bare bygges ved rådhusnivå 3**. 100 tømmer kan byttes mot 60 aether, eller 100 aether mot 60 tømmer.

**Research:** Blacksmith (rådhus 2) og University (rådhus 3).

- Forged Arms: +20% skade for militære tropper; helten, tårn og rådhuset får ikke bonusen.
- Logistics: +25% inntekt fra økonomibygg og fiskebåter.
- Forskning tar tid, betales én gang og gjelder eksisterende og nye enheter i oppdraget. Samme forskning kan ikke startes parallelt i flere bygninger.

**Military Production:** Barracks, Archery Range, Stable, Siege Workshop, Monastery → Fortified Church, Castle og Dock → Harbor.

Fortified Church og Harbor oppgraderes på stedet fra sine respektive forgjengere. De kan ikke bygges separat fra byggemenyen. Oppgradering krever rådhusnivå 3 og en tom produksjonskø. Fortified Church og Castle har automatisk forsvarsild.

Watchtower og Sanctuary fra originalen er beholdt. Rådhuset erstatter navnet Command Hearth i grensesnittet og kan oppgraderes fra 1 til 3. Mat er lagt til som en tredje ressurs for troppeproduksjon. Alle nye kostnader, tider og bonusverdier er foreløpige prototypetall.

Bygging tar tid og kan avbrytes med 75% refusjon. Tropper produseres i kø (maks 5 per bygg og totalt 40 tropper inklusive kø). Siste køplass kan avbrytes med full refusjon. Oppgraderinger og forskning viser tid i kommandopanelet. En ødelagt bygning mister sin produksjon og sin kø.

## 12 rekrutterbare tropper

| Bygning | Tropper |
| --- | --- |
| Barracks | Royal Guard, Spearman |
| Archery Range | Archer, Crossbowman |
| Stable | Scout Cavalry, Knight |
| Siege Workshop | Battering Ram, Catapult |
| Monastery / Fortified Church | Monk |
| Castle | Champion |
| Dock | Fishing Boat |
| Harbor | Fishing Boat, Warship |

Troppene har ulike helse-, fart-, skade-, rekkevidde- og produksjonsverdier. Munker helbreder automatisk nærliggende skadde enheter. Beleiringsenheter har bonusskade mot bygninger og riften. Fiskebåter produserer mat. Modeller er enkle prosedyregenererte figurer, ikke ferdige 3D-assets. Katapulten har enkeltmålsskade, ikke områdeskade.

## Kodestruktur

- `src/content.ts`: bygninger, tropper, forskning, oppgraderingskrav og alle ti regioner.
- `src/art.ts`: modeller, materialteksturer, trær, bakke og dekor.
- `src/main.ts`: Babylon-scene, input, bygging, produksjon, kamp, økonomi, NPC, crafting og regionbytte.
- `src/professions.ts`: ressurser, profesjoner, oppskrifter, XP-regler og sideoppdrag.
- `src/defences.ts`: geometriske kollisjonsregler for mur og port.
- `src/style.css`: menyer og HUD.
- `tests/content.test.mjs`: dataintegritet, opplåsinger, produsentkoblinger og ressursregler.
- `tests/professions.test.mjs`: profesjonskrav, oppskriftskjeder, materialkostnader, forsvar og roterte kollisjonsfelt.
- `tests/game.test.mjs`: faktisk spillkode kjørt med Babylon NullEngine og en minimal DOM-stubb. Tester kartinitialisering, rådhuskrav, produksjon, forskning, handel, økonomi, vannregler, helbredelse og beleiring.

Testene er simulasjonskontroller uten grafikk. De erstatter ikke visuell nettlesertest, ytelsesmåling eller ti komplette spillerunder.

## Kjente grenser

Denne utvidelsen bruker den identifiserte, tilgjengelige prototypepakken, ikke en verifisert nyere versjon av den hostede Sites-utgaven. Den hostede siden og original-DOCX-en er ikke endret. Ingen påstand om at alle tidligere omtalte spillfunksjoner finnes i denne pakken.

- Alle regioner er direkte tilgjengelige; lagring markerer bare fullførte regioner lokalt i nettleseren.
- Helteprogresjon, hær, bygg, forskning og ressurser nullstilles ved regionbytte. Profesjoner, sekk og sideoppdrag nullstilles også. Ingen lagring av en pågående runde.
- Mur og lukket port blokkerer landenheter og fiender angriper hindringer. Allierte har enkel omgåelse langs murender. Det finnes fortsatt ingen generell pathfinding gjennom komplekse muranlegg eller rundt andre bygg, ingen kollisjon mellom tropper og ingen krigståke. Siktstatistikk betyr ikke at krigståke er implementert.
- Rådhustap **eller** heltens død gir nederlag som i kildeprototypen. Heltegjenoppliving er ikke implementert her.
- Gruppevalg med rektangel, kontrollgrupper, ordrekø for bevegelse og retrett er ikke implementert.
- Balanse, kartspesifikke oppdrag og samlet 15–20 minutters spilletid krever faktisk spilletesting.
- Den brede Babylon-importen gir en relativt stor JS-pakke. Ytelse og lasting er ikke profilert.
- Ingen flerspiller, kontoer, kjøp eller backend. Dette er en lokal prototype for videre utvikling i VS Code.
