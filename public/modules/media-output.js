export async function readEvents(url, signal, onMessage, headers = {}) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw Error("Local video output could not connect.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    let end;
    while ((end = text.indexOf("\n\n")) !== -1) {
      const message = text.slice(0, end);
      text = text.slice(end + 2);
      const data = message
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (data) await onMessage(JSON.parse(data.slice(6)));
    }
  }
}
export async function gatherIce(peer) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", check);
      reject(Error("Local video connection timed out."));
    }, 8000);
    function check() {
      if (peer.iceGatheringState === "complete") {
        clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    peer.addEventListener("icegatheringstatechange", check);
    check();
  });
}
export class MediaOutput {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.peers = new Map();
    this.canvas = null;
    this.key = null;
    this.controller = null;
    this.stream = null;
    this.generation = 0;
    this.retry = null;
  }
  async signal(data) {
    const response = await fetch("/media/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-output-key": this.key },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw Error("Could not update the OBS video output.");
  }
  async setCanvas(canvas) {
    if (this.closed) return;
    this.generation++;
    this.canvas = canvas;
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = canvas ? canvas.captureStream(30) : null;
    if (!this.key && window.avatarTools)
      this.key = await window.avatarTools.outputKey();
    if (!this.key) {
      if (canvas) this.onStatus("Live lens output requires the desktop app.");
      return;
    }
    if (!this.controller) {
      await this.connect();
    } else await this.signal({ type: "reset", active: !!canvas });
  }
  async connect() {
    const controller = new AbortController();
    this.controller = controller;
    readEvents(
      "/media/producer",
      controller.signal,
      async (data) => {
        if (data.type === "ready")
          await this.signal({ type: "reset", active: !!this.canvas });
        else if (data.type === "viewer") await this.offer(data.id);
        else if (data.type === "leave") {
          this.peers.get(data.id)?.close();
          this.peers.delete(data.id);
        } else if (data.type === "answer") {
          const peer = this.peers.get(data.id);
          if (peer?.signalingState === "have-local-offer")
            await peer.setRemoteDescription(data.description);
        }
      },
      { "x-output-key": this.key },
    )
      .catch((error) => {
        if (!controller.signal.aborted) this.onStatus(error.message);
      })
      .finally(() => {
        if (this.controller === controller) {
          this.controller = null;
          if (this.canvas) this.retry = setTimeout(() => this.connect(), 1500);
        }
      });
  }
  async offer(id) {
    if (!this.stream) return;
    const generation = this.generation;
    this.peers.get(id)?.close();
    const peer = new RTCPeerConnection({ iceServers: [] });
    this.peers.set(id, peer);
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected")
        this.onStatus("Lens video connected to OBS");
    };
    for (const track of this.stream.getVideoTracks())
      peer.addTrack(track, this.stream);
    try {
      await peer.setLocalDescription(await peer.createOffer());
      await gatherIce(peer);
      if (generation !== this.generation || peer.signalingState === "closed")
        return;
      await this.signal({
        type: "offer",
        id,
        description: peer.localDescription.toJSON(),
      });
    } catch (error) {
      peer.close();
      if (generation === this.generation) this.onStatus(error.message);
    }
  }
  close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.canvas = null;
    this.controller?.abort();
    for (const peer of this.peers.values()) peer.close();
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
export class MediaReceiver {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.id = crypto.randomUUID();
    this.controller = null;
    this.peer = null;
    this.retry = null;
  }
  start() {
    const controller = new AbortController();
    this.controller = controller;
    readEvents(`/media/viewer?id=${this.id}`, controller.signal, (data) =>
      this.message(data),
    )
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted)
          this.retry = setTimeout(() => this.start(), 1500);
      });
  }
  async message(data) {
    if (data.type === "stopped" || data.type === "waiting") {
      this.peer?.close();
      this.peer = null;
      this.video.srcObject = null;
      this.onState(false);
      return;
    }
    if (data.type !== "offer") return;
    this.peer?.close();
    const peer = new RTCPeerConnection({ iceServers: [] });
    this.peer = peer;
    peer.ontrack = (event) => {
      this.video.srcObject = event.streams[0];
      this.video
        .play()
        .then(() => this.onState(true))
        .catch(() => {});
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState))
        this.onState(false);
    };
    await peer.setRemoteDescription(data.description);
    await peer.setLocalDescription(await peer.createAnswer());
    await gatherIce(peer);
    if (this.peer !== peer) return;
    await fetch("/media/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "answer",
        id: this.id,
        description: peer.localDescription.toJSON(),
      }),
    });
  }
  close() {
    clearTimeout(this.retry);
    this.controller?.abort();
    this.peer?.close();
    this.video.srcObject = null;
  }
}
