# wNotes — Projektkonventionen

Notizen für die Arbeit an diesem Repo. Kurz gehalten; Details stehen im README.

## Design

**Schriftart: immer Outfit.** Der Wunsch war Google Product Sans; die trägt Googles
`googlerestricted`-Lizenz („Google offers many fonts under open source licenses. This is not one of
them.") und darf nicht mit der App ausgeliefert werden. Outfit ist die nächstliegende Alternative
unter SIL OFL 1.1 — geometrisch, einstöckiges „a", kreisrunde Formen. Liegt lokal unter
`src/assets/fonts/` samt `OFL.txt`, absichtlich **nicht** über ein CDN: die App muss offline
funktionieren. Als Variable Font deckt eine Datei alle Schnitte ab.

Sollte je eine Product-Sans-Lizenz vorliegen: Dateien lokal ablegen, `@font-face` umbiegen und die
Dateien in `.gitignore` eintragen — nicht mitveröffentlichen.

**Keine gesättigten Akzentfarben in der Oberfläche.** Hervorhebung ist ein erhöhter neutraler Chip
(`--emphasis`), dieselbe Sprache wie das aktive Werkzeug. Blau wurde bewusst entfernt, es wirkte wie
generische Web-UI. Rot (`--danger`) bleibt ausschließlich für destruktive Aktionen. Auswahlrahmen auf
dem Papier nutzen `--ink-select` bzw. `SELECT_COLOR`, weil Grau auf Creme verschwindet.

Referenz ist das dunkle GoodNotes-Layout: schwebende abgerundete Panels, Icon-Toolbar über volle
Breite, cremefarbenes Karopapier.

## Nichts darf nach Web aussehen

Die App läuft in einer WebView, soll aber nicht danach aussehen. Konkret:

- **Keine `window.prompt` / `confirm` / `alert`.** Die zeigen die Dev-Server-URL im Titel. Stattdessen
  `promptText`, `confirmAction`, `chooseAction` aus `src/state/dialogStore.ts`.
- Textmarkierung nur in Eingabefeldern, kein Tap-Highlight, kein Long-Press-Callout, kein Ziehen von
  Bildern, keine Scrollbalken, keine Fokusringe, kein Zeiger-Cursor auf Buttons.
- Hover-Effekte gehören hinter `@media (hover: hover)` — auf Touch bleibt ein Hover sonst nach dem
  Antippen kleben.
- Die JS-seitigen Sperren stehen in `src/lib/useNativeFeel.ts`.

## Animationen

Jede Aktion animiert. Timing-Tokens (`--ease`, `--t-fast/mid/slow`) in `App.css` verwenden, nicht
eigene Werte erfinden. Austritts-Animationen brauchen `useDismissable`, sonst wird das Panel
abgeschnitten. Auf dem Canvas greift kein CSS — dort `tween()` aus `src/lib/tween.ts`. Alles muss
unter `prefers-reduced-motion` zusammenfallen.

## Architektur

- `src/engine/renderer/PageEngine.ts` rendert das **ganze** Notizbuch als vertikalen Streifen von
  Blättern mit Virtualisierung. Ein Seitenwechsel ist ein Scroll, kein Neuaufbau. Strichkoordinaten
  sind seitenlokal, umgerechnet wird an der Pointer-Grenze — das Dateiformat bleibt dadurch stabil.
- Sämtlicher Dateizugriff läuft über Rust-Commands (`src-tauri/src/commands.rs`); das Frontend
  greift nie direkt aufs Dateisystem zu.
- Breakpoints stehen doppelt: `src/state/useLayout.ts` und die Media Queries in `App.css`. Beide
  ändern, wenn einer sich ändert.

## Build

`./scripts/setup-android.sh`, dann `npm run tauri android build --apk --target aarch64`. Der Build
braucht Netzzugriff auf `dl.google.com` — auch für das Android-Gradle-Plugin, für das es keine
Alternative gibt. Die Release-APK kommt **unsigniert** heraus, Signierschritte im README.

iOS-Builds brauchen macOS mit Xcode und lassen sich unter Linux nicht erzeugen.
