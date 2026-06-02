# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-20

### Added
- **QR code buttons**: SafeDelayForm and SafeDelayMultiSigForm now show QR code buttons after deployment, allowing users to scan addresses with a mobile wallet.
- **WIF key import via QR scanner**: SafeDelayForm includes a QR scanner for importing WIF keys.
- **Onboarding copy button for createDelay example**: SafeDelayManagerDashboard onboarding Step 4 now has a copyable example `createDelay(...)` call with a copy button.
- **SafeDelayManager extend() unit tests**: Added tests for the extend() function.

### Fixed
- **SafeDelayManager artifact import path**: Fixed broken import path for SafeDelayManager artifact.
- **SafeDelay bytecode hash in REPOS.md**: Corrected bytecode size (179→185 bytes) and hash.
- **Broken enumerate() function removed**: Removed non-functional enumerate() from SafeDelayManager.