# SimpleStream

A modular Windows control hub for OBS. This is a runnable local prototype, not a finished streaming service.

## Run

Requires Node.js 24 or newer.

```powershell
npm install
npm run setup:tracking
npm start
```

`npm run preview` runs the same UI in a browser at http://127.0.0.1:32145. Only one instance can use the default port at a time. `npm test` checks the local server and OBS state delivery.

`npm run test:desktop` opens temporary Electron windows on a separate test port (32146), using a separate profile. It checks onboarding, personalization, navigation, continuous synthetic-camera tracking, shared chat/alerts, custom layouts, persistence across app restarts, deletion, isolated native browser docks, and landscape/portrait/compact window sizes. It uses a local test website with `X-Frame-Options: DENY` to verify that docks work without an iframe. It also checks real model inference on a public face fixture, PNG persistence, encrypted synthetic Camera Kit settings and actual local video delivery. It does not access your physical webcam or sign into an external account. Screenshots are written to the ignored `artifacts/` directory. Tracking accuracy with a real person and actual OBS capture still require manual verification.

## Pages and layouts

- **Home** opens on app launch: a personalized welcome, cozy illustrated workspace, guided tour, setup checklist, and empty states for past-stream analytics. Historical statistics will populate after platform integrations are built; no stream statistics are fabricated.
- **Avatar** owns the look library, PNG import, facial feature alignment, manual expression checks, tracking controls and OBS output. Tracking continues while visiting another page.
- **Stream Hub** is a customizable grid, initially containing combined chat, an alert list and current viewers. Current viewers are unavailable until accounts are connected. Chat and alerts are labeled demo data.
- **New page** creates a named workspace. Add avatar previews, chat, alerts, viewers or custom browser docks. The same element can appear on multiple pages; previews, messages and alerts share their underlying state.
- **Edit layout** enables header dragging, corner resizing, and exact column/row/width/height inputs on a 12-column grid. Collisions move other elements into free space. Changes save automatically. Custom pages can be renamed or deleted. Layouts adapt to both window width and aspect ratio: landscape preserves the desktop grid, portrait rearranges panels vertically, and compact uses a narrow-window layout. Heights scale to the usable viewport while preserving readable minimum sizes and internal chat/activity scrolling. Portrait and compact edits save independently; returning to a landscape monitor restores that layout.

Page definitions, dimensions, URLs, your display name, onboarding progress and avatar layout are saved locally. Imported avatar artwork and per-look feature settings are saved locally in IndexedDB. New app launches open Home; links and refreshes within a running app preserve the selected page.

## Avatar setup

See [the avatar and Camera Kit guide](docs/AVATARS.md) for camera selection, calibration, saved looks, Lens Studio setup, encrypted credentials and OBS output. PNG tracking runs locally; Camera Kit needs a Snap developer project and network access. Live lens rendering remains unverified until configured with authorized credentials.

## Browser docks

Browser docks use Electron **WebContentsView** rather than an iframe or the deprecated webview approach. Add one through **Add element → Browser dock**, provide a title and HTTPS URL (or an HTTP localhost tool), then leave edit mode to interact with it. Each dock has Back, Forward, Reload, an editable URL, and its own persistent browser session. Its latest navigated address is saved with the layout. Docks stay alive across page changes and are hidden when inactive or while a dialog is open. Up to 12 browser docks can be loaded in one app session.

Dock websites run in sandboxed, isolated guest renderers with Node integration disabled and no application preload bridge. File/data/javascript navigation, pop-ups, downloads and camera/microphone permissions are blocked. Guests cannot request the app's local server. Some providers may reject embedded sign-in or depend on pop-ups; those flows are not supported yet. Browser preview mode supports layout editing but native browser docks require `npm start`.

This app does not yet control OBS scenes, recording or broadcast state. It currently replaces the workspace for supported panels; OBS remains responsible for video composition and broadcasting.

## Module structure

`public/app.js` owns routing and the top navigation. Home and Avatar have separate HTML views and initializer modules. `public/modules/workspace.js` owns page management and grids; `grid-model.js` contains placement/validation; `widgets.js` contains reusable widget renderers and shared chat/activity state. Avatar expression updates are shared with preview widgets. `browser-dock.js` synchronizes DOM dock bounds with the native manager in `browser-docks.cjs`, through the narrow bridge in `preload.cjs`.

The Avatar workflow was informed by [Streamfog's overview](https://streamfog.com/), [custom assets](https://streamfog.com/customize/), and [OBS/lens setup documentation](https://streamfog.com/help/) reviewed November 12, 2026: choose a look, preview/customize it, and hand it off to OBS. Streamfog supports AR lenses and custom Lens Studio assets; SimpleStream implements PNG characters, generated facial features, and a configurable Camera Kit adapter. No Streamfog assets or lens catalog are bundled.

## Windows builds and CI

```powershell
npm ci
npm run setup:tracking
npm run check
npm test
npm run build:win
npm run test:packaged
npm run checksums
```

Windows packaging produces an x64 NSIS installer, a portable ZIP and SHA-256 checksums in `dist/`. The downloaded face-tracking model is checked against a pinned SHA-256 digest and included in packaged builds. The package includes only the application files and production dependencies. Personal browser profiles, credentials, local workspace data, screenshots, logs and development caches are excluded from Git and build inputs.

The Windows GitHub Actions workflow runs syntax/public-source checks, unit tests and desktop tests, then builds and smoke-tests the packaged app before uploading installer/ZIP/checksum artifacts. It runs on pushes to `main`, pull requests and manual dispatches. Pushing a `v` tag that matches `package.json` prepares a **draft prerelease** with the tested Windows artifacts. Builds are currently unsigned; a signing certificate or supported signing service must be configured before signed distribution. No macOS/Linux jobs are configured yet.

`npm run check:public` scans tracked source for accidentally included runtime files, common credential formats and private conversation/home-directory references. It is a guardrail, not a substitute for reviewing staged files before publication. Release drafts are reviewed and published separately.

## Connecting real services

See [integration options and roadmap](docs/INTEGRATIONS.md) for native OAuth, simpler Streamer.bot/StreamElements bridges, OBS WebSocket control, backend boundaries and feature priorities. Most users should only need to sign in; developer app registration is done once by the project operator. No hosted service is required for local avatars, docks or OBS control. Direct Kick webhook delivery is a strong reason to add a small relay service.

## Working features

- Import and persist transparent PNGs (up to 4 MB), or use three customizable built-in characters.
- Position generated eyes and mouth, adjust scale, and save layout on this computer.
- Webcam face tracking in a worker: blinking, mouth opening, smile/brow/gaze and approximate head movement, with calibration and sensitivity controls, using MediaPipe. Download the model once with the setup command; inference and webcam frames stay local. Imported PNGs are static artwork with animated features, not a Live2D rig.
- Transparent OBS browser output synchronized over a loopback-only server. Add `http://127.0.0.1:32145/overlay.html` as a Browser Source, width 800 and height 650. Keep the companion open; closing it stops the output. Imported PNGs and their feature settings are restored from the local look library.
- Combined chat filters, local demo messages, and a testable local activity feed.

## Integration work remaining

Live Twitch, Kick and YouTube account connections are not implemented. No messages or alert tests are sent to the platforms. There is no OBS alert overlay or sound playback yet; the activity feed is local UI only.

1. Twitch: register an application, implement OAuth with secure token storage, then subscribe to chat and account-specific alerts through [EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/). Handle subscription permissions, refresh, reconnect and deduplication.
2. YouTube: Google OAuth, active live-chat discovery and [liveChatMessages](https://developers.google.com/youtube/v3/live/docs/liveChatMessages). Include quota handling, reconnect, and membership/Super Chat event mapping.
3. Kick: official [Events API](https://github.com/KickEngineering/KickDevDocs/blob/main/events/introduction.md) requires a publicly reachable webhook receiver. A future relay must verify signatures before forwarding events to this desktop app, with per-user authentication and no provider secrets in the renderer.
4. Snap: the Camera Kit adapter and local capture-output path are implemented. A developer project, Web API token and accessible Lens Groups are required to validate authorized lens rendering; no live Snap token is used in automated tests. See [avatar setup](docs/AVATARS.md).
5. Add alert animations/audio to a separate OBS output, real chat sending and moderation, reconnect states, and an installer with signing.

Use a normalized event contract for adapters: chat `{ id, platform, channelId, author, text, timestamp }`, activity `{ id, platform, type, actor, amount?, currency?, timestamp }`. Provider-specific payload parsing and event IDs belong at the adapter boundary. Merge by timestamp, deduplicate by platform plus event ID, and visibly report connection failures.

## Local boundaries

Electron uses a sandboxed renderer with Node integration disabled. The local HTTP server binds only to 127.0.0.1, checks Host/Origin, and validates state updates. It serves the installed MediaPipe runtime and locally downloaded model. Local processes and other clients that can access the loopback address can read the avatar output; it is not a password-protected service. Native platform OAuth tokens are not implemented. Browser docks retain site cookies/session data in their separate Electron partitions, like a browser profile.
