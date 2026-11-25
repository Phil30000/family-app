# Weitere Familie anlegen

Jede Familie bekommt eine eigene Kopie der App: eigene Adresse, eigene Datenbank, eigener Einrichtungs-Code.
Der Code ist für alle gleich, jedes Update geht automatisch an alle Kopien.

## Einmalig je Familie (Claude erledigt das mit dir zusammen, ca. 10 Minuten)

1. Cloudflare › Speicher › D1 › „Datenbank erstellen“, Name `family-app-<name>`. Die angezeigte ID notieren.
2. In `wrangler.jsonc` unter `env` einen Eintrag ergänzen:
   ```jsonc
   "<name>": {
     "name": "family-app-<name>",
     "d1_databases": [{ "binding": "DB", "database_name": "family-app-<name>", "database_id": "<ID>" }],
     "ai": { "binding": "AI" },
     "triggers": { "crons": ["*/5 * * * *"] }
   }
   ```
3. Bereitstellungsbefehl in Cloudflare › Worker `family-app` › Einstellungen › Builds um ` && npx wrangler deploy --env <name>` ergänzen.
4. Nach dem ersten Bereitstellen: Worker `family-app-<name>` › Einstellungen › Variablen › Geheimnis `SETUP_CODE` anlegen (ein langes, zufälliges Wort).
5. Adresse `https://family-app-<name>.p-hitzbleck.workers.dev` und den Einrichtungs-Code an die Familie geben.
   Der erste, der die Seite öffnet und den Code eingibt, wird dort Admin.
6. Den iCloud-Zugang trägt die Familie selbst in der App ein (Einstellungen › iPhone-Kalender).
   Er wird mit dem Einrichtungs-Code der Familie verschlüsselt; du siehst ihn nie.

## Grenzen

- Der kostenlose Cloudflare-Tarif erlaubt 5 Zeitpläne pro Konto: also höchstens 5 Familien.
- Alle Familien teilen sich die kostenlosen Grenzen (100.000 Aufrufe und 5 Mio. gelesene Zeilen pro Tag).
  Eine Familie braucht davon heute unter 10 %.
- Du als Konto-Inhaber könntest technisch an die Datenbanken der anderen. Das muss die Familie wissen.
