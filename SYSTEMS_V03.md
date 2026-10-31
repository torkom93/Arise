# Arise 0.3 forsvar oppdrag og profesjoner

Denne versjonen utvider den lokale spillprototypen. Alle nye kostnader, tider og statistikker er startverdier som må balanseres i spillerunder. De ti regionene og innholdet fra 0.2 er beholdt. Original-DOCX og den hostede siden er ikke endret.

## Forsvarsbygg

| Bygg | Rådhusnivå | Kostnad | HP / forsvar | Effekt |
| --- | --- | --- | --- | --- |
| Brick Wall | 1 | 10 tømmer, 5 murstein | 1200 / 20 | Blokkerer landenheter. R roterer før plassering. |
| Gate | 1 | 25 tømmer, 5 murstein, 3 planker | 900 / 15 | Åpnes og lukkes fra handlingspanelet. Åpen port slipper alle gjennom. |
| Outpost | 1 | 60 tømmer, 20 aether | 260 / 3 | Varsler om fiender innen 25m, maksimalt hvert 20. sekund. Ingen skade. |
| Guard Tower | 2 | 110 tømmer, 70 aether, 5 murstein, 5 steinblokker | 650 / 12 | 28 skade, 19m rekkevidde, 1,3s angrepsintervall. |
| Bomber Tower | 3 | 160 tømmer, 120 aether, 10 murstein, 4 jernbarrer | 720 / 10 | 42 skade, 20m rekkevidde, 3,2s intervall. Treff skader fiender innen 4m, uten vennlig ild. |

Mur og port blokkerer etter at byggingen er ferdig. Murseksjoner kan plasseres kant mot kant med 8m mellom sentrene når de har samme rotasjon. Porten kan ikke lukkes mens en mobil enhet står i åpningen. Hvis en enhet står i en mur ved fullføring, flyttes den til nærmeste side slik at den ikke blir fanget i geometrien.

Fiender som møter en lukket hindring, stopper og angriper den. Allierte forsøker en enkel omvei langs murenden. Dette er ikke full A* eller navigasjonsnett: komplekse lukkede muranlegg kan kreve nye ordre eller en åpnet port. Andre bygg og naturdekor har ikke fått generell bevegelseskollisjon. Prosjektiler bruker ikke siktlinjekollisjon mot murer.

## Grunnstatistikk

Alle entiteter får eksplisitt helse, maksimalt helse, skade, forsvar, fart, rekkevidde, angrepsintervall, nivå, sikt og fraksjon. Panelet viser statistikk for soldater, helten, arbeidere, fiender, bygninger og Vinnie. Ressursnoder viser gjenværende mengde i stedet for kampdata.

Fysisk skade multipliseres med:

```text
1 - min(0.50, forsvar / (forsvar + 100))
```

Forsvar virker for eksisterende og nye enheter. Nivå er foreløpig en grunnstatistikk; dette innfører ikke et komplett XP-system for helten eller troppene. Fiendenivå følger regionnummeret. Sikt er en deteksjons-/varslingsverdi; det er fortsatt ingen krigståke.

## Vinnie Jonas og kart 1

Vinnie er en nøytral sivil med 120 HP og 2 forsvar ved startleiren på første kart. Han blir ikke angrepet av vanlig fiende-AI og kan ikke skades gjennom kampordrer. Navnet vises over ham når kameraet ser ham.

Når kartet starter, advarer han spilleren. I dialogen sier han:

> Ikke slå dere ned her. Dette er et farlig land, fullt av farer. Om natten kommer de fra riften, og ingen mur varer evig. Hvis dere blir, må dere forberede dere.

Høyreklikk ham med helten valgt for å gå bort og snakke. Helten må være innen 7m både når et oppdrag tas, og når det leveres. Ressursene som kreves i oppdragene, teller fra tidspunktet oppdraget tas. Oppdragene vises i journalen og i en kort oppsummering ved hovedmålene.

### Stein på stein

Vinnie vil se at bosetningen kan overleve et angrep.

1. Ta oppdraget hos Vinnie.
2. Samle minst 20 leire og 15 vanlig stein.
3. Lag minst 5 murstein gjennom oppskriften «Brenn murstein».
4. Bygg og fullfør en Brick Wall. Minst én ferdig mur må fortsatt stå ved levering.
5. Returner helten til Vinnie og lever oppdraget.

Belønning: **80 tømmer, 40 mat og 25 XP i murerfag**. Mursteinen brukes som vanlig i byggekostnaden; oppdraget krever ikke at den fortsatt ligger i sekken. Belønningen kan bare mottas én gang per runde.

### Medisin før mørket

Vinnie vil ha medisiner før nye angrep kommer.

1. Ta oppdraget hos Vinnie.
2. Samle minst 12 urter.
3. Lag 3 helbredende salver.
4. Behold minst 3 salver i sekken og returner til Vinnie.
5. Lever salvene; de trekkes fra sekken.

Belønning: **40 aether, 60 mat og 20 XP i alkymi**. Har spilleren brukt salvene underveis, må nye lages før oppdraget kan leveres. Belønningen kan bare mottas én gang per runde.

Begge oppdrag er valgfrie og sperrer ikke hovedseieren. Oppdrag som ikke er levert når riften ødelegges, får ingen automatisk belønning. De må gjøres før oppdraget avsluttes. De andre ni kartene har de nye samleressursene og profesjonssystemet, men ikke Vinnie eller disse to sideoppdragene.

## Samleressurser og håndverk

Tømmer, aether og mat fra 0.2 er beholdt. Arbeiderne kan nå også samle **vanlig stein, jernmalm, leire og urter** ved å høyreklikke tydelige ressursklynger. Forekomstene er uttømmelige. Ressursene vises i materialoversikten og sekken.

Den interne gamle nøkkelen `stone` betyr fortsatt **aether** av hensyn til kildekoden. Ny vanlig stein bruker nøkkelen `rock`. Navnene er adskilt i grensesnitt og oppskrifter.

| Profesjon | Hvordan XP tjenes | Rolle |
| --- | --- | --- |
| Skogbruk | Manuell tømmerinnsamling og plankeproduksjon | Planker og bedre tømmerinnsamling |
| Gruvedrift | Manuell innsamling av aether, stein, jern og leire | Bedre mineralinnsamling |
| Murerfag | Murstein og steinblokker | Materialer til forsvarsbygg |
| Smedfag | Jernbarrer og utstyrssett | Utstyr og materialer til Bomber Tower |
| Urtekunnskap og alkymi | Manuell urteinnsamling og salver | Bedre urteinnsamling og medisin |
| Matlaging | Feltrasjoner | Økt matbeholdning gjennom oppskrifter |

Alle profesjoner starter på nivå 1. Samle-XP er **1 XP per 5 råvarer**, med desimaler bevart internt. Oppskrifter gir XP ved fullføring. Nivå 2–5 krever totalt **30, 90, 180 og 300 XP**. Skogbruk, gruvedrift og urtekunnskap gir +5% manuell innsamlingsfart per nivå etter det første, opp til +20%. Passive leirer gir ikke profesjons-XP.

### Oppskrifter

| Oppskrift | Ingredienser | Utbytte | Profesjon / nivå | Tid / XP |
| --- | --- | --- | --- | --- |
| Sag planker | 15 tømmer | 5 planker | Skogbruk 1 | 5s / 10 |
| Brenn murstein | 5 tømmer, 10 leire, 5 stein | 5 murstein | Murerfag 1 | 6s / 12 |
| Hugg steinblokker | 15 stein | 5 steinblokker | Murerfag 1 | 6s / 10 |
| Smelt jern | 10 tømmer, 12 jernmalm | 4 jernbarrer | Smedfag 1 | 8s / 15 |
| Bland helbredende salve | 4 urter | 1 salve | Alkymi 1 | 5s / 10 |
| Tilbered feltrasjoner | 5 tømmer, 20 mat, 2 urter | 1 feltrasjon | Matlaging 1 | 5s / 10 |
| Smi våpensett | 10 aether, 3 jernbarrer, 2 planker | 1 våpensett | Smedfag 2 + ferdig Blacksmith | 12s / 20 |
| Smi rustningssett | 15 aether, 5 jernbarrer | 1 rustningssett | Smedfag 3 + ferdig Blacksmith | 14s / 25 |

Grunnoppskrifter kan lages i leiren uten et eget verksted. Det kan være **ett aktivt håndverksarbeid** om gangen. Ingrediensene betales ved start; gjenstander og XP kommer først når timeren fullføres. Avbrytelse gir 75% ingrediensrefusjon og ingen gjenstander eller XP. Ødelegges nødvendig Blacksmith under utstyrsproduksjon, avbrytes arbeidet på samme måte.

Menyer pauser spillet. Når en oppskrift startes, lukkes menyen og tiden går videre. En aktiv timer vises i venstrepanelet. Utstyrsoppskrifter krever en fullført Blacksmith gjennom hele produksjonen.

### Brukbare gjenstander

- **Salve:** helbreder valgt skadet alliert enhet for 80 HP, opp til maksimalt helse. Forbrukes ikke hvis målet allerede har full helse.
- **Feltrasjon:** forbrukes for å gi 40 mat. Netto matgevinst er 20 etter oppskriftens ingredienser.
- **Våpensett:** gir valgt helt eller angripende militærtropp +4 skade. Én gang per enhet.
- **Rustningssett:** gir valgt helt eller militærtropp +5 forsvar. Én gang per enhet.

Velg målenheten i verden eller troppelisten før sekken åpnes. Planker, murstein, jernbarrer og steinblokker brukes automatisk i oppskrifter eller byggekostnader. Det finnes ikke egne utstyrsslots, salg av disse materialene eller bytte mellom enheter i denne versjonen.

## Lagring og validering

Profesjoner, ressurser, gjenstander og oppdragsstatus gjelder bare den aktive runden. De nullstilles ved omstart og regionbytte. Det finnes fortsatt ingen lagring av en pågående runde eller varig kampanjeprogresjon for profesjoner.

Automatiske tester kjører faktisk spillkode med Babylon NullEngine og tester blant annet innsamling, oppskriftskrav, kostnader, timer, bruk av utstyr, engangsbelønninger, portkollisjon, fiendeangrep på mur og Bomber Tower-områdeskade. Testene dekker også fortsatt seiersflyten i alle ti regioner. Grafikk, mobilgrensesnitt, komplekse muranlegg, balanse og komplette menneskelige spillerunder gjenstår å kontrollere i nettleseren.
