export class SnapLenses {
  constructor({
    onError,
    onOutput,
    loadSdk = () => import("/generated/camera-kit.js"),
  }) {
    this.onError = onError;
    this.onOutput = onOutput;
    this.kit = null;
    this.session = null;
    this.config = null;
    this.sdk = null;
    this.lenses = [];
    this.loadSdk = loadSdk;
    this.applicationId = 0;
  }
  async loadConfig() {
    this.config = globalThis.window?.avatarTools
      ? await globalThis.window.avatarTools.readConfig()
      : { apiToken: "", groupIds: [] };
    return {
      configured: !!this.config.apiToken,
      groupIds: this.config.groupIds,
    };
  }
  async ensureKit() {
    if (this.kit) return;
    if (!this.config) await this.loadConfig();
    if (!this.config.apiToken || !this.config.groupIds.length)
      throw Error(
        "Set up Camera Kit with your Web API token and Lens Group IDs first.",
      );
    this.sdk = await this.loadSdk();
    this.kit = await this.sdk.bootstrapCameraKit({
      apiToken: this.config.apiToken,
    });
  }
  async loadLibrary() {
    await this.ensureKit();
    const { lenses, errors } = await this.kit.lensRepository.loadLensGroups(
      this.config.groupIds,
    );
    if (!lenses?.length)
      throw Error(
        "No lenses were returned. Check the token, trusted origin, and Lens Group IDs in your Snap project.",
      );
    this.lenses = lenses;
    return { lenses, errors };
  }
  async start(stream, canvas, mirror = true) {
    await this.ensureKit();
    this.session = await this.kit.createSession({ liveRenderTarget: canvas });
    this.session.events.addEventListener("error", (event) => {
      this.onOutput(null);
      this.onError(
        Error(
          event.detail?.error?.message ||
            "The selected lens stopped rendering.",
        ),
      );
    });
    const source = this.sdk.createMediaStreamSource(stream, {
      cameraType: "front",
      ...(mirror ? { transform: this.sdk.Transform2D.MirrorX } : {}),
    });
    this.source = source;
    await this.session.setSource(source);
    // Do not play a raw camera feed or publish one before a Lens is selected.
  }
  async apply(lens) {
    if (!this.session) throw Error("Start the camera before applying a lens.");
    const applicationId = ++this.applicationId,
      session = this.session;
    try {
      const applied = await session.applyLens(lens);
      if (applicationId !== this.applicationId || session !== this.session)
        return false;
      if (applied === false) throw Error("Lens application was interrupted.");
      await this.session.play("live");
      await this.source?.setRenderSize(1280, 720);
      if (applicationId !== this.applicationId || session !== this.session)
        return false;
      await this.session.play("capture");
      this.onOutput(this.session.output.capture);
      return true;
    } catch (error) {
      if (applicationId !== this.applicationId || session !== this.session)
        return false;
      this.onOutput(null);
      await session.pause();
      throw error;
    }
  }
  async loadCustom(lensId, groupId) {
    await this.ensureKit();
    return this.kit.lensRepository.loadLens(lensId, groupId);
  }
  async stop() {
    this.applicationId++;
    this.onOutput(null);
    if (this.session) {
      const session = this.session;
      this.session = null;
      await session.pause();
      await session.destroy();
    }
  }
  async reset() {
    await this.stop();
    if (this.kit) {
      await this.kit.destroy();
      this.kit = null;
    }
    this.config = null;
    this.lenses = [];
  }
}
