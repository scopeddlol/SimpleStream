# Avatars, face tracking, and Camera Kit

The Avatar page has two engines. **PNG avatar** runs locally with MediaPipe and produces transparent output. **AR lenses** uses Snap Camera Kit Web to render lenses available to a configured Snap developer project. Both can be shown in custom page preview widgets and sent to OBS.

## PNG characters

1. Open Avatar → PNG avatar. Choose Mooncat, Little spirit, or Pixel pal, or import a transparent PNG up to 4 MB / 4096 × 4096 pixels.
2. While the camera is off, drag the eyes or mouth into position. Use the sliders for exact positioning, feature size, eye style, character scale and visibility. Disable added eyes or mouth if the artwork already has features you want to keep static. Tint applies to built-in artwork.
3. Select the camera and quality, then start face tracking. Allow webcam access in Windows if requested.
4. Look forward with open eyes and a relaxed mouth, then select **Center & calibrate**. The app samples 15 detected frames to establish a neutral pose.
5. Adjust smoothing, mouth sensitivity, blink sensitivity and head movement. Optional local camera preview shows tracking points without sending camera images to the output.
6. Copy the OBS URL into a Browser Source at **800 × 650**. The feature-placement guides appear only in the editor.

Tracking maps mouth opening, independent blinks, smile, brow, gaze, head roll, approximate yaw/pitch and head movement. Inference runs in a dedicated worker. Only one video frame is in flight, so slow inference drops extra frames instead of building latency. The target rate is 15 or 30 FPS; actual performance depends on the computer and camera. Face loss briefly holds the pose and then relaxes toward neutral.

Custom artwork, names and feature settings are stored in IndexedDB on this computer and restored on next launch. Built-in customizations are saved too. No avatar or camera frame is uploaded to a hosted service in PNG mode. An imported PNG remains flat artwork; these controls do not generate a Live2D rig.

## Snapchat / Lens Studio lenses

### One-time developer setup

1. Open [My Lenses / Camera Kit](https://my-lenses.snapchat.com/) and create or select a Snap developer project with Camera Kit Web enabled. Complete Snap's account/access setup if prompted.
2. Obtain the **Camera Kit Web staging API token** for development. This is different from a Snapchat account password or a Login Kit OAuth client secret.
3. Add the app's exact local origin to the project's **Trusted Origins**. The setup dialog displays it; the normal desktop origin is `http://127.0.0.1:32145`.
4. Find the Lens Group IDs available to the project. Use the project's sample lens group to begin, or publish a Lens Studio lens and add it to a group associated with the project.
5. In SimpleStream, open **Avatar → AR lenses → Set up Camera Kit**. Enter the Web API token and the Lens Group IDs, then save. Enter credentials only in the app, not source files or public issues.

The desktop app encrypts the token using Electron safeStorage / Windows credential protection. The configuration lives in the application data profile, not the repository or installer. If encryption is unavailable, the app refuses to save plaintext. Blank token input preserves the saved token; **Forget settings** removes it. Browser preview mode cannot save Camera Kit credentials.

### Use a lens

1. Select **Load my lenses**, search the library, and select a lens. A published lens can also be loaded with a Lens ID and Lens Group ID.
2. Start the lens camera. Allow any terms prompt displayed by Snap's SDK. The app does not bypass or customize that prompt.
3. Add the same OBS URL as a Browser Source at **1280 × 720**. Camera Kit's **capture** target is sent over a local WebRTC connection; its live preview can include UI intended only for the local user.
4. Change lenses while running, or stop the camera when finished. Failed lens application stops output rather than deliberately falling back to unfiltered camera video.

Ordinary Snapchat sharing URLs, Lens Studio project files and Streamfog's proprietary catalog cannot be imported directly. A lens must be published and accessible to the configured Camera Kit project. Lenses vary in Web SDK compatibility and performance. Camera Kit requires network access for SDK resources, authorization and lens assets and may collect SDK telemetry; a lens can also use network-enabled features. PNG mode does not initialize Camera Kit.

Staging tokens normally produce Snap's staging watermark and have development limits. Public Camera Kit distribution requires Snap review and a production token. Required materials include a public privacy policy and a demo showing the integration and terms acceptance. See [Snap account setup](https://developers.snap.com/camera-kit/getting-started/account-setup), [Web SDK setup](https://developers.snap.com/camera-kit/integrate-sdk/web/web-configuration), and [release guidance](https://developers.snap.com/camera-kit/app-review/release-app).

## Output and limitations

- Keep SimpleStream open. Changing pages does not stop the active engine.
- PNG output is a transparent canvas driven by local expression/state updates. AR output is a video feed and may include the camera background depending on the selected lens. Do not assume WebRTC preserves lens alpha transparency.
- This build forwards **video only** for lenses. It does not forward lens audio, install a system-wide virtual camera, or control OBS scenes/recording.
- The local server transports signaling and PNG state; it does not upload camera footage or relay the lens video through a hosted backend. Camera Kit itself still contacts Snap and any services used by the chosen lens.
- Local output is intended for OBS on the same computer, not a network-accessible camera service. The server binds to loopback. Publisher signaling requires a process-local key exposed only to the trusted desktop renderer; browser docks cannot obtain it.
- The built-in PNG engine and Camera Kit engine run separately. Only the selected engine owns the webcam and runs inference.

## Validation

Unit tests cover calibration, smoothing, expression mapping, state validation, signaling authorization and Camera Kit adapter lifecycle with a simulated SDK. Desktop checks run the real MediaPipe model on a checksum-verified public face fixture, exercise the worker with a synthetic camera, save/reload a PNG, verify encrypted synthetic configuration, and receive actual local video frames in an OBS-style output window. Tests never use a physical webcam or an authorized Snap token.

Authorized Camera Kit bootstrap, real lens rendering, Snap's consent flow, performance with real users and capture inside OBS still require manual verification with a configured project and the target hardware. Automated adapter tests are not evidence that a live Snap lens has been validated.
