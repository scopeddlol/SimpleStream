export class FaceTracker {
  constructor(onResult, onError) {
    this.onResult = onResult;
    this.onError = onError;
    this.busy = false;
    this.worker = null;
  }
  async start() {
    this.worker = new Worker("/modules/tracking-worker.js");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          Error(
            "Face tracker timed out. Check that the tracking model is installed.",
          ),
        );
        this.stop();
      }, 25000);
      this.worker.onerror = () => {
        clearTimeout(timeout);
        reject(Error("Could not start the face tracking worker."));
        this.onError(Error("Face tracking worker stopped."));
      };
      this.worker.onmessage = (event) => {
        const data = event.data;
        if (data.type === "ready") {
          clearTimeout(timeout);
          resolve();
        } else if (data.type === "error") {
          clearTimeout(timeout);
          this.busy = false;
          reject(Error(data.message));
          this.onError(Error(data.message));
        } else if (data.type === "result") {
          this.busy = false;
          this.onResult(data);
        }
      };
      this.worker.postMessage({ type: "init" });
    });
  }
  submit(frame, timestamp) {
    if (!this.worker || this.busy) {
      frame.close();
      return false;
    }
    this.busy = true;
    this.worker.postMessage({ type: "frame", frame, timestamp }, [frame]);
    return true;
  }
  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
