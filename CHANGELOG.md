# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Versioned canonical resolution** for cross-package base types — packages with broken `.index.json` (e.g. `de.basisprofil.r4@1.5.4`) now fall back to direct directory scan via node_modules, enabling KBV profiles with versioned base type references to resolve correctly
