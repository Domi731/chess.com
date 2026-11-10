# Backend verbinden

Knight Club erzeugt automatisch ein anonymes Gastprofil. Dafür muss niemand E-Mail, Passwort oder andere Anmeldedaten eingeben. Online-Partien mit Freunden und die geräteübergreifende Speicherung brauchen trotzdem ein verbundenes Supabase-Projekt.

## Werte, die du mir zum Verbinden geben kannst

Diese beiden öffentlichen Frontend-Werte werden in `.env.local` eingetragen und dürfen im Browser verwendet werden:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Du findest sie im Supabase-Projekt unter **Settings → API**. Der Publishable Key kann auch noch als `anon`-Key bezeichnet sein.

**Bitte sende mir keinen `sb_secret_…`- oder `service_role`-Key.** Beide sind serverseitige Schlüssel mit erweitertem Datenbankzugriff. Die Supabase Edge Runtime stellt neue Schlüssel über `SUPABASE_SECRET_KEYS` und ältere Projekte über `SUPABASE_SERVICE_ROLE_KEY` bereit. `make-move` liest beide Formate; solche Schlüssel gehören weder nach `.env.local` noch in den Browser.

Für Vercel brauche ich außerdem die Projekt-Domain, damit ich dir sagen kann, welche Domain-Einstellungen geprüft werden müssen. Lege dort dieselben zwei `VITE_`-Variablen an; danach muss die Website neu deployed werden.

## Einrichtung im Supabase-Projekt

1. Aktiviere anonyme Anmeldungen unter **Authentication → Sign In / Providers → Anonymous Sign-Ins**. Ohne diesen Schalter kann die App kein Gastprofil für Online-Partien anlegen.
2. Führe `supabase/migrations/202611100001_platform.sql` im SQL Editor aus oder verknüpfe das Projekt mit der Supabase CLI und führe `supabase db push` aus. Das richtet Tabellen, Profile, Zugprüfung, Einladungen, Freundschaften, Richtlinien und Realtime ein.
3. Verknüpfe die CLI einmal mit deinem Supabase-Projekt und deploye die Funktion für serverseitig geprüfte Züge:

   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase functions deploy make-move
   ```

   Der Project Ref steht am Anfang der Projekt-URL. `supabase login` verwendet dein eigenes Supabase-Konto; schicke mir dafür kein Zugriffstoken. Die serverseitigen Supabase-Key-Variablen stellt die Edge Runtime bereit.

4. Prüfe, dass `make-move` JWT-Verifizierung aktiviert hat. Die Einstellung steht bereits in `supabase/config.toml`.
5. Trage `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` ein und starte Vite neu. Lege dieselben Werte zusätzlich als Vercel-Environment-Variablen an.
6. Prüfe in zwei Browsern oder auf zwei Geräten: Eine Person erstellt einen Einladungslink, die andere öffnet ihn und tritt als Gast bei.

## Gastprofil und Daten

Das Gastprofil bleibt im Browser gespeichert. Es ist kein Konto mit Passwort und lässt sich nicht wiederherstellen, wenn die Browserdaten gelöscht werden oder auf ein anderes Gerät wechseln. Um Züge zwischen Geräten zu synchronisieren, brauchen beide Spieler ein Supabase-Gastprofil; dafür ist weiterhin kein Login nötig.

Stockfish, chess.js und die Schachregeln benötigen keine API-Keys. Stockfish läuft im Browser.
