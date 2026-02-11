# RTA - Real-Time Audio Analyzer

Analyseur de spectre audio temps réel avec lecteur audio et playlist.

[Démo](https://p0slx.github.io/rta/)

## Description

Application web pour analyser des fichiers audio avec visualisation spectrale en temps réel. Trois modes d'affichage : barres, courbe et spectrogramme. Échelle logarithmique 20 Hz à 20 kHz, plage -90 dB à 0 dB.

## Pourquoi

C'est marrant.

## Analyse

- FFT : 512 à 32768 bins (résolution ~1.3 Hz/bin à 44.1 kHz)
- Bandes logarithmiques : 16 à 14844 paramétrables
- Double lissage : Web Audio API + EMA configurable
- Peak hold avec décroissance

## Visualisation

- Mode barres, courbe, spectrogramme
- Palettes : Magma, Viridis, Plasma, Inferno, Grayscale
- Échelles : logarithmique, linéaire
- Gamma configurable

## Métadonnées

Extraction automatique MP3 (ID3v2/ID3v1) et FLAC via parseur WASM maison.

## Formats

MP3, WAV, OGG, FLAC, AAC et autres formats supportés par le navigateur.

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
