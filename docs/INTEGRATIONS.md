# Integration options and implementation roadmap

## Recommendation

Start with a local OBS WebSocket adapter and an optional Streamer.bot bridge. This makes the hub useful without making every user register developer apps. Add native Twitch and YouTube connections next, then a small authenticated webhook relay for direct Kick support. Keep provider adapters separate from widgets so the same panels work with either source.

These are researched options and planned work. The current build does not yet implement live provider connections, OBS control, or these bridges.

## What OAuth actually means

The application developer registers SimpleStream once with each provider. End users then click Connect and grant permission; they do not create developer apps themselves. A public app identifier can ship in a desktop application. A confidential client secret cannot be kept secret in a distributed desktop build. Platform permissions, token refresh, revocation, quotas and any provider verification still apply.

### Native Twitch

Twitch documents a public-client Device Code flow that obtains and refreshes user tokens without a client secret. Pair it with EventSub WebSockets for a desktop connection without a webhook server. Request chat-read permissions first, then optional chat-write/moderation/broadcast-management permissions as features require them. Validate tokens and handle refresh/reconnect/revocation. A SimpleStream Twitch app registration is still required.

Sources: [OAuth flows](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [chat authentication](https://dev.twitch.tv/docs/chat/authenticating/), [EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

### Native YouTube

Google supports installed desktop OAuth clients and PKCE. Sending messages, moderating, and accessing private channel data require the relevant user authorization. Its official streaming-chat example also supports an API key for reading accessible live chat: that is a useful read-only option, not a replacement for authorization for account actions. A Google project/API enablement and key or OAuth client are still needed. Use active live-chat discovery, streamList where appropriate, and quota/error handling. Public distribution may require OAuth consent verification depending on scopes.

Sources: [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [streaming live chat and API-key option](https://developers.google.com/youtube/data/live/streaming-live-chat).

### Native Kick

Kick documents OAuth 2.1 with PKCE, and its documented authorization-code exchange includes a client secret. Keep confidential exchanges on a backend rather than shipping a secret in the desktop executable. Official chat and activity events arrive at a public webhook receiver. A direct implementation therefore needs a small HTTPS service to verify event signatures, deduplicate event IDs, and forward authorized events to the correct signed-in desktop client. Reconnects must recover safely without mixing channels or duplicating alerts.

Sources: [OAuth flow](https://github.com/KickEngineering/KickDevDocs/blob/main/getting-started/generating-tokens-oauth2-flow.md), [events](https://github.com/KickEngineering/KickDevDocs/blob/main/events/introduction.md).

## Simpler integrations

### Streamer.bot local bridge

Users connect their accounts in Streamer.bot, enable its local WebSocket server, and connect SimpleStream to it. The documented events cover Twitch, YouTube and Kick chat/activity, plus viewer updates and many other integrations. Use its password authentication and subscribe only to necessary event categories. Streamer.bot handles the platform OAuth setup; SimpleStream still needs an adapter and a running Streamer.bot instance. Its Kick integration uses Streamer.bot's website integration to relay webhooks, so this avoids operating a SimpleStream relay rather than eliminating the upstream server requirement.

Sources: [event catalog](https://docs.streamer.bot/api/websocket/events), [WebSocket authentication](https://docs.streamer.bot/api/websocket/guide/authentication), [Kick setup](https://docs.streamer.bot/guide/platforms/kick).

### StreamElements activity bridge

The current Astro gateway provides WebSocket subscriptions for channel activity/session/overlay events and accepts supported channel tokens or OAuth tokens. This could supply existing alerts and tips without rebuilding every notification integration. Use the token for the correct linked platform account, keep it in the OS credential store, and never expose it in a dock URL or renderer localStorage. This is an activity integration, not a universal combined-chat API. Channel-token setup is simpler for an early personal installation; a distributed product should offer a supported authorization flow.

Sources: [Astro WebSockets](https://docs.streamelements.com/websockets), [topics](https://docs.streamelements.com/websockets/topics).

### Browser docks

The existing native browser docks are the fastest way to include a service's own dashboard. Users sign in directly to that site's isolated browser session. This does not grant the rest of SimpleStream API access, merge the site's chat into native widgets, or bypass platform login restrictions. Embedded sites can reject login or require unsupported pop-ups.

### OBS control without platform OAuth

OBS Studio includes WebSocket support from version 28. A local connection with its generated password can drive scene selection, audio/source controls, and stream/recording status. It requires neither Twitch OAuth nor a hosted backend. Add explicit connection states and confirmations for stream-ending actions. Keep the password in the OS credential store.

Source: [OBS remote control guide](https://obsproject.com/kb/remote-control-guide).

### Avatar engines

Keep native PNG/MediaPipe as the lightweight default. A VTube Studio adapter can control supported Live2D model/hotkey/parameter workflows through its local plugin API and user-granted plugin authentication, without platform OAuth. Snap Camera Kit remains a distinct AR-lens integration with its own developer configuration and asset lifecycle. Do not imply that a PNG overlay supplies a full Live2D rig or that a third-party lens catalog is automatically available.

Source: [official VTube Studio API](https://github.com/DenchiSoft/VTubeStudio).

## Is a hosted backend required?

Not for local layouts, avatars, browser docks, OBS control, local session recording, or a Streamer.bot bridge. Twitch public-client auth and EventSub can also be desktop-direct. YouTube desktop OAuth can be local; a shared API key and quota management may justify a service for a larger distribution.

Use a backend for direct Kick webhook delivery and confidential token exchanges, or for optional cross-device sync and remote control. A small service can start with:

1. HTTPS OAuth callbacks/exchanges and a provider-secret store.
2. Signature-verified webhook intake with replay protection and event-ID deduplication.
3. An authenticated outbound WebSocket connection from each desktop; no inbound router port forwarding.
4. Per-user routing and a short-lived event queue for reconnects.
5. Minimal account/connection metadata in a database, with disconnect and deletion flows.

Keep webcam processing, layouts and stream summaries local by default. Avoid server-side chat retention unless users explicitly enable a feature that needs it. Never send browser-session cookies to the relay. API secrets and signing certificates belong in server/CI secret stores, not the public source repository. Local SQLite can store stream summaries; optional cloud synchronization can come later.

## Feature priorities

### First: make the control hub useful

- OBS scenes, source visibility, audio mixer, streaming/recording status and performance indicators.
- Streamer.bot adapter; then native Twitch/YouTube adapters behind the same event contract.
- Live chat with replies, emotes, badges, mentions, search, moderation, and visible connection failures.
- Alert history, replay/mute controls, tip integration and a separate on-stream alert/audio output.
- Session recording: viewer samples, duration, new followers, activity totals and markers. Treat missing metrics as unavailable rather than zero.

### Next: make the workspace powerful

- Independent landscape, portrait and compact layouts; saved workspace presets and optional per-monitor overrides.
- Widget registry with versioned settings and a permission model before accepting third-party plugins.
- Keyboard shortcuts, command palette, timers, notes, goals, stream checklist and quick actions.
- Local export/import of layouts that omits tokens, cookies, private dock URLs and chat history by default.
- Stream markers/clips, channel title/category editing, polls, predictions and channel-point actions where each provider permits them.

### Later: deepen the platform

- Secure remote companion, optional sync/backup and team permissions.
- More avatar engines, expression presets, chat-triggered effects and Camera Kit lenses.
- Signed Windows installers and updates; macOS/Linux packaging after Windows is stable.

The priorities above are product recommendations, not claims that these features are already shipped. Historical live-viewer averages should be computed from collected session samples or an authorized analytics source; do not substitute VOD view counts for live-viewer analytics.
