# Delt uge i madplansappen

Denne opsætning giver korte links uden TinyURL og gør det muligt, at to personer kan åbne og redigere samme uge.

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

`madplan/index.html`

Selve appen. Den er nu ændret, så `Del uge` ikke bruger TinyURL eller is.gd. Hvis Google Apps Script URL er sat op, bruger appen i stedet korte links i formatet `?uge=kortId`.

`apps-script/Code.gs`

Backend til Google Apps Script. Den gemmer ugens data i Google Sheet og henter seneste version ud fra id.

`shared-week-client.js`

Ekstern hjælperfil. Den ligger klar, men appen har også fået den nødvendige delingslogik direkte i `madplan/index.html`.

## Deploy af backend

1. Åbn Google Apps Script.
2. Opret et nyt projekt.
3. Indsæt indholdet fra `apps-script/Code.gs`.
4. Deploy som Web app.
5. Vælg `Execute as: Me`.
6. Vælg `Who has access: Anyone with the link`.
7. Kopiér Web app URL.
8. Send URL’en til ChatGPT, så den kan indsættes direkte i `madplan/index.html`.

## Midlertidig fallback

Indtil Web App URL’en er sat ind, deler appen stadig direkte uden TinyURL. Linket er længere, men der er ingen mellemside og ingen ekstern linkforkorter.

## Endelig linkform

Når Apps Script URL’en er sat ind, bliver linket kort og direkte:

```text
https://mgforever26.github.io/investeringsdashboard/madplan/?uge=Ab7kP2xQ
```

Begge kan åbne samme link og redigere samme uge.

## Redigering fra to personer

Løsningen er append-only. Hver gemning opretter en ny række med samme id og højere version. Når appen henter en uge, bruges seneste række for id'et.

Det betyder:

- Begge kan redigere samme uge.
- Seneste gemning vinder.
- Historikken bevares i arket.

Det er simpelt og robust nok til madplan. Det er ikke Google Docs realtime samarbejde, men det er rigeligt bedre end TinyURL med elefanthue.
