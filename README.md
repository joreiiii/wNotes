# wNotes

Handschriftliche Notiz-App im Stil von GoodNotes, gebaut mit [Tauri v2](https://v2.tauri.app/),
React/TypeScript und einer PixiJS-basierten (WebGL) Zeichen-Engine. Zielplattformen: iOS
(primär) und Android, lauffähig auch als Desktop-App für die Entwicklung.

## Funktionsumfang (V1 – Core Notiz-Engine)

- Notizbuch-Bibliothek mit Ordnerstruktur
- Seiten pro Notizbuch mit Vorlagen (blanko, liniert, kariert, gepunktet, Millimeterpapier)
- Freihand-Zeichnen (Stift, Textmarker, Radierer) mit Drucksensitivität/Neigung via Pointer
  Events (Apple Pencil kompatibel), einfache Palm-Rejection
- Automatische Formen-Erkennung (Linie, Rechteck, Ellipse) über einen Toolbar-Toggle
- PDF-Import & Annotation (PDF als Hintergrund-Layer, Ink-Layer darüber)
- Textboxen und Bilder einfügen, verschieben/skalieren/rotieren
- Lasso-Auswahl mit Verschieben/Skalieren/Rotieren, Kopieren/Einfügen/Duplizieren/Löschen
- Undo/Redo, Zoom & Pan
- Lokale Persistenz (Notizbücher werden als Dateien im App-Datenverzeichnis gespeichert)

Nicht enthalten (bewusst spätere Phase): Cloud-Sync/Accounts, Kollaboration,
Handschrift-zu-Text/OCR, Volltextsuche, Tags/Favoriten, PDF-/Bild-Export, Präsentationsmodus.

## Architektur

- **Frontend**: React + TypeScript + Vite. Die Zeichen-Engine (`src/engine/`) ist reines
  TypeScript, unabhängig von React: `PageEngine` kapselt PixiJS/`pixi-viewport`, Pointer-
  Handling, Undo/Redo-Command-Stack und Selektions-/Transform-Logik für jede offene Seite.
- **Rendering**: PixiJS (WebGL) für Kamera/Viewport/Batching; Striche werden über
  `perfect-freehand` in ein druckabhängiges Outline-Polygon umgewandelt und darüber als
  gefülltes `PIXI.Graphics`-Objekt gerendert.
- **PDF**: `pdf.js` rendert PDF-Seiten im Frontend zu einer Bitmap, die als Hintergrund-
  Textur hinter dem Ink-Layer sitzt.
- **Backend**: Rust/Tauri-Commands (`src-tauri/src/commands.rs`) übernehmen sämtliche
  Dateisystem-Operationen (Notizbücher/Ordner/Seiten/Assets/Thumbnails); das Frontend hat
  keinen direkten Dateizugriff.

## Entwicklung (Desktop, für schnelle Iteration)

```bash
npm install
npm run tauri dev
```

Das startet die App als natives Desktop-Fenster (Linux/macOS/Windows) mit Live-Reload.
Die komplette UI/Zeichen-Engine ist identisch zu der, die später in der iOS/Android-WebView
läuft – der Desktop-Loop ist der schnellste Weg, Features zu testen.

## Mobile Targets

### Android

Voraussetzungen: Android SDK + NDK, `ANDROID_HOME`/`NDK_HOME` gesetzt, Java 17+.

```bash
npm run tauri android init   # einmalig: generiert das Android-Projekt in src-tauri/gen/android
npm run tauri android dev    # Live-Reload auf Emulator/Gerät
npm run tauri android build  # signiertes/unsigniertes APK bzw. AAB
```

### iOS

**Erfordert macOS mit installiertem Xcode** – die `tauri ios`-Subcommands existieren nur auf
macOS-Hosts und lassen sich in keinem Linux-Container ausführen (auch nicht durch Nachinstallieren
von Paketen, da die Tauri-CLI die iOS-Toolchain-Integration nur auf macOS kompiliert).

```bash
# auf einem Mac, mit Xcode + Xcode Command Line Tools installiert:
npm install
npm run tauri ios init    # einmalig: generiert das Xcode-Projekt in src-tauri/gen/apple
npm run tauri ios dev     # startet Simulator oder verbundenes Gerät mit Live-Reload
npm run tauri ios build   # Release-Build/Archiv für TestFlight/App Store
```

Bundle-Identifier ist `com.j0reiiimc.wnotes` (in `src-tauri/tauri.conf.json`), vor einem echten
Store-Release ggf. anpassen und ein Apple-Developer-Team in Xcode hinterlegen.

## Bekannte Einschränkungen dieser Version

- Radierer ist ein Strich-Radierer (entfernt ganze Striche), kein Pixel-Radierer mit
  Geometrie-Splitting.
- Seiten-Reorder in der Thumbnail-Leiste erfolgt über Auf/Ab-Buttons, kein Drag & Drop.
- Bibliotheks-Dialoge (Ordner/Notizbuch anlegen/umbenennen/löschen) nutzen einfache native
  Prompts statt eigener UI-Modals.
- Kein Cloud-Sync/Kollaboration/Handschrifterkennung/Suche/Export – siehe Scope oben.
