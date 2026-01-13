# RTA

Analyseur de spectre audio temps réel avec spectrogramme.


### [Demo](https://p0slx.github.io/rta/)

## Présentation

Analyser des fichiers audio avec visualisation spectrale en temps réel. Supporte trois modes d'affichage : barres, courbe et spectrogramme. Échelle logarithmique de 20 Hz à 20 kHz, plage dynamique de -90 dB à 0 dB.

### Analyse

- FFT de 512 à 32768 bins (résolution jusqu'à ~1.3 Hz/bin à 44.1 kHz)
- Agrégation en bandes logarithmiques (16 à 14844 bandes paramétrables)
- Double lissage : analyseur natif Web Audio + EMA configurable
- Maintien des crêtes avec décroissance réglable
- Calcul RMS, dynamique, niveaux peak/floor en temps réel

### Statistiques

- Nom de fichier, durée, sample rate
- Taille FFT, buffer size, nombre de bins
- Résolution fréquentielle en Hz/bin
- Niveau moyen, crête, plancher (dB)
- RMS (dB)
- Plage dynamique (dB)
- Nombre de bandes actives

## Pourquoi ?

C'est marrant.

## Installation

```bash
pnpm install
```

## Développement

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Formats Supportés

Tous les formats audio que le navigateur peut décoder nativement :
- MP3
- WAV
- OGG
- FLAC
- AAC
- etc.
