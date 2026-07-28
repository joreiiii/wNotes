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

Erfolgreich gebaut und auf Gerät installierbar. Voraussetzungen: Java 17+, Android SDK + NDK.

```bash
./scripts/setup-android.sh              # installiert SDK, NDK und die Rust-Android-Targets
export ANDROID_HOME="$HOME/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/26.3.11579264"

npm run tauri android build --apk --target aarch64   # arm64, deckt aktuelle Geräte ab
```

Das Android-Projekt unter `src-tauri/gen/android` ist eingecheckt; `tauri android init` ist
also nur nötig, wenn es neu erzeugt werden soll.

**Netzwerkzugriff:** Der Build lädt von `dl.google.com` — sowohl das SDK als auch das
Android-Gradle-Plugin, das Gradle aus Googles Maven-Repo zieht. Es gibt dafür keine
Alternative: Maven Central führt `com.android.tools.build:gradle` nur bis 2.3.0, das Gradle
Plugin Portal leitet dorthin weiter, und `maven.google.com` ist bloß ein Redirect auf
`dl.google.com`. In abgeschotteten Umgebungen muss dieser Host also freigegeben sein.

**Signieren:** `android build` liefert eine *unsignierte* Release-APK, die sich so nicht
installieren lässt. Zum Testen:

```bash
BT="$ANDROID_HOME/build-tools/34.0.0"
APK=src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk

keytool -genkeypair -keystore test.jks -alias wnotes -keyalg RSA -keysize 2048 \
  -validity 10000 -storepass "$PW" -keypass "$PW" -dname "CN=wNotes Test"
"$BT/zipalign" -p -f 4 "$APK" aligned.apk
"$BT/apksigner" sign --ks test.jks --ks-key-alias wnotes \
  --ks-pass "pass:$PW" --key-pass "pass:$PW" --out wnotes.apk aligned.apk
```

Für eine echte Veröffentlichung gehört ein eigener, dauerhaft aufbewahrter Schlüssel her —
geht der verloren, lässt sich eine installierte App nicht mehr aktualisieren.

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

## Build-Status

| Ziel | Stand |
| --- | --- |
| Desktop (Linux) | läuft, für die Entwicklung genutzt |
| Android arm64 | **APK gebaut, signiert, 13,8 MB** |
| Android x86_64 (Emulator) | nicht gebaut, sollte mit `--target x86_64` funktionieren |
| iOS | nur konfiguriert — Build erfordert macOS + Xcode |

## Bekannte Einschränkungen dieser Version

- Radierer ist ein Strich-Radierer (entfernt ganze Striche), kein Pixel-Radierer mit
  Geometrie-Splitting.
- Seiten-Reorder in der Thumbnail-Leiste erfolgt über Auf/Ab-Buttons, kein Drag & Drop.
- Bibliotheks-Dialoge (Ordner/Notizbuch anlegen/umbenennen/löschen) nutzen einfache native
  Prompts statt eigener UI-Modals.
- Kein Cloud-Sync/Kollaboration/Handschrifterkennung/Suche/Export – siehe Scope oben.
