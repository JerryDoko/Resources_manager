# Resources Manager for Android

This is a standalone native Android application. It does not start or connect to
the desktop Next.js/Electron service.

## Data access

- Android 13 and newer: requests separate image, video, and audio permissions.
- Android 8 through 12: requests read access to shared storage.
- Documents and arbitrary folders: uses Android's system folder picker and keeps
  the granted read permission.

The app stores only its library index and playback positions in its private
SQLite database. Original files remain in their existing locations.

## Build

Use JDK 17 and Android SDK 35:

```sh
gradle -p android :app:assembleRelease \
  -PappVersion=1.1.7 \
  -PversionCode=10500
```

The included development signing key makes APK upgrades stable for direct
installation and GitHub Releases. A Play Store release should use a private
production key supplied through CI secrets.
