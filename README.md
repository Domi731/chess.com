# Knight Club

Eine responsive Schachplattform mit eigener Gestaltung. **Alle Funktionen sind kostenlos**; es gibt keine Abos, Zahlungsdaten oder Funktionssperren.

## Lokal starten

Voraussetzung: Node.js 20.19+ oder 22.12+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Ohne Supabase kannst du Dashboard, lokale Partien, Stockfish, Rätsel, Lektionen, Eröffnungen und PGN-Analyse ohne Anmeldung nutzen. Für Online-Partien mit Freunden und geräteübergreifende Speicherung braucht die App ein Supabase-Projekt. Sie erstellt dann automatisch Gastprofile; niemand muss sich anmelden.

## Supabase einrichten

1. Lege ein Supabase-Projekt an und aktiviere **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
2. Trage URL und Publishable Key in `.env.local` ein:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   ```

3. Führe `supabase/migrations/202611100001_platform.sql` im SQL Editor deines Projekts aus. Die Migration erstellt Profile, Wertungen, Partien, Freundschaften, Gegnersuche, Rätselstatistiken, Lektionen, RLS-Regeln und den Avatar-Speicher.
4. Deploye die Edge Function `make-move` mit der Supabase CLI:

   ```bash
   supabase functions deploy make-move
   ```

   Supabase stellt Publishable- und Secret-Keys der Edge Runtime bereit. Die Funktion prüft Online-Züge, Zeitüberschreitungen und Spielerrechte serverseitig. Ein `sb_secret_…`-Key darf niemals in `.env.local`, mit `VITE_` oder im Browser landen.
5. Lege `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel an und deploye die Website neu. Details und Checkliste stehen in [BACKEND_SETUP.md](BACKEND_SETUP.md).

## Funktionen

- Dashboard mit echten Kontodaten, Wertungen, gespeicherten Partien und Analysegenauigkeit. Nicht vorhandene Statistiken werden als leer angezeigt, nicht erfunden.
- Schachbrett mit legalen Zügen, Drag-and-drop und Klicksteuerung, Rochade, en passant, Schach, Matt, Patt, Umwandlung, Uhr, Zugverlauf, Rücknahme im lokalen Modus, Drehen, Brettfarben, Figurenstilen und optionalen Zugtönen.
- Lokale Partien, Stockfish-Gegner mit fünf Stärken und drei Spielstilen sowie Online-Partien per Einladung oder Gegnersuche. Verfügbare Zeitkontrollen: 1+0, 2+1, 3+0, 3+2, 5+0, 10+0, 15+10 und 30+0; eigene Zeitkontrollen sind ebenfalls möglich.
- Taktikrätsel mit Schwierigkeitsfiltern, Ergebnisrückmeldung und kostenloser Puzzlewertung im Gastprofil oder lokal im Browser.
- Interaktive Lektionen, Stockfish-Stellungsanalyse, PGN-Import, Genauigkeitswerte und Bewertungsverlauf.
- Opening Explorer, öffentliche Live-Partien, Rangliste, Profile, Freundschaften, Online-Anwesenheit, Partiehistorie, PGN-Download und Kontoeinstellungen.
- Automatische Gastprofile für Online-Spiele, Profilbild und persönliche Darstellungseinstellungen. Es gibt keinen Login-Bildschirm.
- Alle genannten Bereiche sind frei zugänglich. Es gibt keine Zahlungsintegration oder Premium-Funktion, die ein Abo voraussetzt.

## Stockfish-Lizenz

Beim Start und Produktionsbuild kopiert `scripts/copy-stockfish.mjs` Stockfish 19 Lite Single-Threaded und die zugehörige Lizenzdatei aus dem installierten Paket nach `public/engine`. Die Analyse läuft im Browser auf dem Gerät.

## Vercel

Das Repository enthält `vercel.json` für Build, Ausgabe und Client-Routing. Hinterlege `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` in den Vercel-Projektvariablen und deploye das Projekt. Die Supabase Edge Function bleibt bei Supabase.

