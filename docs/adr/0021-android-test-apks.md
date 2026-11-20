# ADR-21. Bundled Android test APKs from main

- **Status:** Proposed for team review
- **Date:** 20 Nov 2026
- **Decided by:** Nana Yaw requested implementation; team review pending
- **Related:** E13-04, E14-02, ADR-1, ADR-2, ADR-12, ADR-19

## Context

The team needs a downloadable Android app after each merge to main. The PWA already runs inference on the device. A hosted wrapper would still rely on website caching to launch offline. The current thin slice has no offline queue or persistent model cache.

## Options considered

1. A Trusted Web Activity opening the hosted PWA: easy website updates, but offline launch depends on its cache and service worker.
2. Capacitor with bundled web files: app screens and runtime ship in the APK, while backend and model dependencies must be handled separately.

## Decision

Implement option 2 as an Android test distribution path alongside the existing Vercel PWA. Pin Capacitor 8.6.2 and keep the current ONNX runtime. Build and retain an APK in GitHub Actions after every main push, with checks on relevant PRs. Use a persistent team-test key for main and an isolated disposable app ID for PR previews.

This adds packaging for E13-04. It does not replace the PWA-first baseline, switch to TFLite, change clinical requirements or claim offline completion. It does not approve Play Store distribution or create a numbered release per commit.

## Consequences

Android builds add Java and SDK maintenance. Main APK updates need installation by the user. Keep signing material outside git. The source, commit and version remain traceable, and the Vercel deployment flow remains independent. A physical Android test is still required for WebView inference, file selection and in-place updates.

The [Android runbook](../runbook/android-apk.md) records the online dependencies, configuration and device checks. Follow-on work must add model persistence, offline session handling and queued saving before claiming offline screening.

## Revisit trigger

Review this choice if WebView cannot run the worker/WASM safely on supported phones, misses the reference-phone budget, or the team decides to distribute through the Play Store.

## Sources

- [Capacitor setup](https://capacitorjs.com/docs/getting-started)
- [Android support](https://capacitorjs.com/docs/android)
- [Capacitor 8 Android requirements](https://capacitorjs.com/docs/updating/8-0)
