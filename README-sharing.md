# Delt uge i madplansappen

Denne implementering giver korte links uden TinyURL og gør det muligt, at to personer kan åbne og redigere samme uge.

## Hvad der er sat op

Der er oprettet et Google Sheet som lille database:

`Madplan delte uger`

Sheet id:

`1-7cv_o6FsVRUIsLWfJF2-bS5ny3AZHWcJXylKbumuP4`

Faneblad:

`weeks`

Kolonner:

`id`, `createdAt`, `updatedAt`, `version`, `payload`, `lastEditor`, `note`

## Filer i repoet

`apps-script/Code.gs`

Backend til Google Apps Script. Den gemmer ugens data i Google Sheet og henter seneste version ud fra id.

`shared-week-client.js`

Frontend hjælper til GitHub Pages appen. Den kan gemme, hente, dele og autosave en delt uge.

## Deploy af backend

1. Åbn Google Apps Script.
2. Opret et nyt projekt.
3. Indsæt indholdet fra `apps-script/Code.gs`.
4. Deploy som Web app.
5. Vælg `Execute as: Me`.
6. Vælg `Who has access: Anyone with the link`.
7. Kopiér Web app URL.
8. Indsæt den i `shared-week-client.js` her:

```js
window.MADPLAN_SHARE_CONFIG = window.MADPLAN_SHARE_CONFIG || {
  apiUrl: 'PASTE_DEPLOYED_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE',
  urlParam: 'uge',
  autosaveDelayMs: 900
};
```

## Kobling i appen

Appen skal have scriptet indlæst:

```html
<script src="shared-week-client.js"></script>
```

Knappen `Del uge` skal kalde:

```js
MadplanShare.shareCurrentWeek({
  getState: collectMadplanState,
  editor: 'Michael'
});
```

Ved opstart skal appen hente delt uge, hvis URL indeholder `?uge=...`:

```js
MadplanShare.loadFromUrl({
  applyState: applyMadplanState
});
```

Efter ændringer i valg skal autosave trigges:

```js
const autosave = MadplanShare.startAutoSave({
  getState: collectMadplanState,
  editor: 'Michael'
});

// Kald denne når retter eller valg ændres
autosave.schedule();
```

## De to app-specifikke funktioner

Der mangler kun, at den konkrete madplansapp definerer disse to funktioner, fordi de afhænger af appens nuværende datastruktur:

```js
function collectMadplanState() {
  return {
    // returnér de valgte retter, justeringer, ekstra varer osv.
  };
}

function applyMadplanState(state) {
  // skriv state tilbage i appens UI og genberegn madplan, pdf og indkøbsliste
}
```

Når de to funktioner er koblet til appens eksisterende state, bliver linket kort:

```text
https://mgforever26.github.io/investeringsdashboard/?uge=Ab7kP2xQ
```

Ingen TinyURL. Ingen mellemstation. Direkte ind i appen.

## Redigering fra to personer

Løsningen er append-only. Hver gemning opretter en ny række med samme id og højere version. Når appen henter en uge, bruges seneste række for id'et.

Det betyder:

- Begge kan redigere samme uge.
- Seneste gemning vinder.
- Historikken bevares i arket.

Det er simpelt og robust nok til madplan. Det er ikke Google Docs realtime samarbejde, men det er rigeligt bedre end TinyURL med elefanthue.
