# RailBook
An Android-first railway booking assistant built with React, TypeScript and Capacitor, designed to simplify Tatkal booking preparation, passenger management, journey planning and PNR tracking — with local-first data storage and no application backend.

## Development

Requires Node 22, JDK 21 and the Android SDK (API 36). If your shell runs an older Node, the test and Android scripts switch to the version in `.nvmrc` through nvm.

```sh
npm install
npm run dev           # web app with hot reload
npm test              # unit tests
npm run android:sync  # build the web app and copy it into android/
npm run android:run   # build and run on a device or emulator
```

The Android commands need `ANDROID_HOME` set and a JDK 21 on `PATH` or in `JAVA_HOME`. `android/gradle/gradle-daemon-jvm.properties` makes Gradle use Java 21 even if `~/.gradle/gradle.properties` pins another JDK.

## Structure

| Path | Purpose |
|---|---|
| `src/core` | Shared types, on-device storage, settings and formatting |
| `src/data` | Timetable and PNR data providers |
| `src/platform` | Wrappers around native features: alerts, clipboard, official pages |
| `src/ui` | Icons, layout pieces (headers, sheets, chips) and form controls |
| `src/features/home` | Dashboard with the next booking window and quick actions |
| `src/features/tasks` | Booking tasks: list, five-step wizard, detail and the guided booking session |
| `src/features/tatkal` | Booking window rules, readiness checks, copy panel and practice runs |
| `src/features` (other) | Passengers, PNR, settings and first-run welcome screens |
| `public/data/timetable.json` | Bundled timetable, empty until a dataset is chosen |

## Screens

A booking task holds the journey, passengers, preferences and preferred payment method. Its booking session is a step pipeline: RailBook completes its own steps (pre-flight checks, waiting for the window) and the person completes every step on the official site, tapping through as they go. The session records how long each step took and saves the PNR or the reason it wasn't booked.

## Limits

RailBook helps the person booking and does not book for them. It does not automate or scrape IRCTC. Login, CAPTCHA, OTP, payment and submission all happen on the official site, by hand.

Saved passenger details use Capacitor Preferences, which is not encrypted.
