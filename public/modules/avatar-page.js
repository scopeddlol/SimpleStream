import { drawAvatar, defaultLayout, neutralPose } from "../avatar.js";
export function initAvatar() {
  const $ = (selector) => document.querySelector(selector);
  let layout = { ...defaultLayout },
    pose = { ...neutralPose },
    image = null,
    avatar = null;
  try {
    layout = {
      ...layout,
      ...JSON.parse(localStorage.getItem("layout") || "{}"),
    };
  } catch {}
  const canvas = $("#avatar"),
    video = $("#webcam");
  let stream,
    tracker,
    starting = false,
    frame,
    lastTime = -1,
    lastPublish = 0,
    busy = false;
  function draw() {
    drawAvatar(canvas, image, layout, pose);
    document.dispatchEvent(
      new CustomEvent("avatar-frame", { detail: { image, layout, pose } }),
    );
  }
  async function publish(extra = {}) {
    try {
      const response = await fetch("/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout, pose, ...extra }),
      });
      if (!response.ok) throw Error(`Output error ${response.status}`);
      $("#status").textContent = "OBS output available · local only";
    } catch {
      $("#status").textContent =
        "OBS output unavailable · check the local server";
    }
  }
  for (const input of document.querySelectorAll("[data-setting]")) {
    input.value = layout[input.dataset.setting];
    input.addEventListener("input", () => {
      layout[input.dataset.setting] = Number(input.value);
      localStorage.setItem("layout", JSON.stringify(layout));
      draw();
      publish();
    });
  }
  $("#overlay-url").textContent = `${location.origin}/overlay.html`;
  $("#copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("#overlay-url").textContent);
      document.dispatchEvent(
        new CustomEvent("setup-progress", { detail: "output" }),
      );
      $("#copy").textContent = "Copied ✓";
      setTimeout(() => ($("#copy").textContent = "Copy URL"), 1800);
    } catch {
      $("#status").textContent = "Select and copy the output URL above.";
    }
  };
  $("#upload").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.type !== "image/png" || file.size > 4_000_000)
        throw Error("Choose a PNG smaller than 4 MB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const next = new Image();
      next.src = data;
      await next.decode();
      image = next;
      avatar = data;
      $("#current-asset").textContent = file.name + " · current look";
      $("#built-in-look").classList.remove("selected");
      $(".import-look").classList.add("selected");
      draw();
      await publish({ avatar });
      $("#camera-message").textContent =
        "PNG loaded. Use the sliders to place the animated eyes and mouth.";
    } catch (error) {
      $("#camera-message").textContent =
        error.message || "Could not open this PNG.";
    }
  };
  $("#reset").onclick = () => {
    layout = { ...defaultLayout };
    image = null;
    avatar = null;
    $("#upload").value = "";
    $("#current-asset").textContent = "Mooncat is your current look.";
    $("#built-in-look").classList.add("selected");
    $(".import-look").classList.remove("selected");
    localStorage.removeItem("layout");
    for (const input of document.querySelectorAll("[data-setting]"))
      input.value = layout[input.dataset.setting];
    draw();
    publish({ avatar });
  };
  function stopCamera() {
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    pose = { ...neutralPose };
    $("#camera").textContent = "◎ Start face tracking";
    $("#tracking-status").textContent = "Camera off";
    draw();
    publish();
  }
  function track(now) {
    if (!stream) return;
    try {
      if (
        video.readyState >= 2 &&
        video.currentTime !== lastTime &&
        now - lastPublish > 65
      ) {
        lastTime = video.currentTime;
        lastPublish = now;
        const result = tracker.detectForVideo(video, now);
        if (result.faceBlendshapes.length) {
          const scores = Object.fromEntries(
            result.faceBlendshapes[0].categories.map((item) => [
              item.categoryName,
              item.score,
            ]),
          );
          const points = result.faceLandmarks[0],
            a = points[33],
            b = points[263];
          const target = {
            mouth: Math.min(1, (scores.jawOpen || 0) * 1.8),
            left: scores.eyeBlinkLeft || 0,
            right: scores.eyeBlinkRight || 0,
            roll: Math.max(
              -0.5,
              Math.min(0.5, -Math.atan2(b.y - a.y, b.x - a.x)),
            ),
          };
          for (const key in pose)
            pose[key] = pose[key] * 0.35 + target[key] * 0.65;
          $("#tracking-status").textContent = "● Tracking";
        } else {
          pose = { ...neutralPose };
          $("#tracking-status").textContent = "Looking for a face";
        }
        draw();
        if (!busy) {
          busy = true;
          publish().finally(() => (busy = false));
        }
      }
      frame = requestAnimationFrame(track);
    } catch (error) {
      stopCamera();
      $("#camera-message").textContent = `Tracking stopped: ${error.message}`;
    }
  }
  $("#camera").onclick = async () => {
    if (stream) {
      stopCamera();
      return;
    }
    if (starting) return;
    starting = true;
    $("#camera").disabled = true;
    $("#tracking-status").textContent = "Loading tracker…";
    try {
      if (!tracker) {
        const { FaceLandmarker, FilesetResolver } =
          await import("/vendor/vision_bundle.mjs");
        const files = await FilesetResolver.forVisionTasks("/vendor/wasm");
        tracker = await FaceLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      lastTime = -1;
      $("#camera").textContent = "■ Stop tracking";
      $("#camera-message").textContent =
        "Blink, tilt your head, and talk. Only expression values reach the OBS source.";
      frame = requestAnimationFrame(track);
    } catch (error) {
      stopCamera();
      $("#camera-message").textContent =
        `Could not start tracking. Run npm run setup:tracking and allow webcam access. ${error.message}`;
    } finally {
      starting = false;
      $("#camera").disabled = false;
    }
  };
  window.addEventListener("pagehide", () => {
    stream?.getTracks().forEach((track) => track.stop());
    tracker?.close();
  });

  $("#built-in-look").onclick = () => $("#reset").click();
  for (const button of document.querySelectorAll("[data-expression]"))
    button.onclick = () => {
      if (stream) {
        $("#camera-message").textContent =
          "Stop tracking before testing an expression.";
        return;
      }
      pose = {
        ...neutralPose,
        ...(button.dataset.expression === "blink"
          ? { left: 1, right: 1 }
          : button.dataset.expression === "talk"
            ? { mouth: 0.8 }
            : {}),
      };
      draw();
      publish();
    };
  for (const label of document.querySelectorAll(
    'label[for="upload"], .toolbar label',
  )) {
    label.tabIndex = 0;
    label.setAttribute("role", "button");
    label.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("#upload").click();
      }
    };
  }

  draw();
  publish({ avatar });
}
