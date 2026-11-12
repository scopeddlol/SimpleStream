let landmarker;
self.onmessage = async (event) => {
  const { type, frame, timestamp } = event.data;
  try {
    if (type === "init") {
      const { FaceLandmarker, FilesetResolver } =
        await import("/vendor/vision_bundle.mjs");
      const files = await FilesetResolver.forVisionTasks("/vendor/wasm");
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/models/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: "ready" });
    } else if (type === "frame" && landmarker) {
      const result = landmarker.detectForVideo(frame, timestamp);
      self.postMessage({
        type: "result",
        timestamp,
        landmarks: result.faceLandmarks[0] || [],
        scores: Object.fromEntries(
          (result.faceBlendshapes[0]?.categories || []).map((item) => [
            item.categoryName,
            item.score,
          ]),
        ),
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error.message || "Face tracker failed",
    });
  } finally {
    frame?.close();
  }
};
