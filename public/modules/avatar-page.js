import { drawAvatar, defaultLayout, neutralPose } from "../avatar.js";
import { validateState } from "../avatar-state.js";
import { PoseMapper, defaultTracking } from "./pose-mapper.js";
import { FaceTracker } from "./face-tracker.js";
import { listLooks, saveLook, deleteLook } from "./look-store.js";
import { SnapLenses } from "./snap-lenses.js";
import { MediaOutput } from "./media-output.js";

const builtins = [
  {
    id: "builtin:cat",
    name: "Mooncat",
    avatar: null,
    layout: { ...defaultLayout },
  },
  {
    id: "builtin:ghost",
    name: "Little spirit",
    avatar: null,
    layout: { ...defaultLayout, character: "ghost", bodyColor: "#d0e5db" },
  },
  {
    id: "builtin:robot",
    name: "Pixel pal",
    avatar: null,
    layout: { ...defaultLayout, character: "robot", bodyColor: "#98c6dc" },
  },
];
export async function initAvatar() {
  const $ = (selector) => document.querySelector(selector);
  let layout = { ...defaultLayout },
    pose = { ...neutralPose },
    image = null,
    avatar = null,
    mode = "png",
    stream = null,
    tracker = null,
    mapper = new PoseMapper(),
    frame = 0,
    starting = false,
    framePending = false,
    lastVideoTime = -1,
    lastFrame = 0,
    lastStat = 0,
    processed = 0,
    lastResult = null,
    lensCanvas = null,
    selectedLens = null,
    lenses = [],
    looks = [],
    activeLook = builtins[0],
    saveTimer,
    publishTimer,
    publishing = false,
    publishAgain = false,
    selectionGeneration = 0;
  let preferences = { ...defaultTracking, quality: "balanced", deviceId: "" };
  try {
    const saved = JSON.parse(
      localStorage.getItem("simplestream:tracking") || "{}",
    );
    for (const [key, min, max] of [
      ["smoothing", 0, 250],
      ["mouthGain", 0.5, 4],
      ["eyeGain", 0.5, 3],
      ["motion", 0, 2],
      ["fps", 15, 30],
    ])
      if (Number.isFinite(saved[key]))
        preferences[key] = Math.max(min, Math.min(max, saved[key]));
    if (typeof saved.mirror === "boolean") preferences.mirror = saved.mirror;
    if (["balanced", "hd"].includes(saved.quality))
      preferences.quality = saved.quality;
    if (typeof saved.deviceId === "string")
      preferences.deviceId = saved.deviceId;
  } catch {}
  const canvas = $("#avatar"),
    video = $("#webcam");
  const message = (text) => ($("#camera-message").textContent = text);
  const output = new MediaOutput(
    (text) => ($("#output-status").textContent = text),
  );
  const snap = new SnapLenses({
    onError: (error) => {
      message(`Lens stopped: ${error.message}`);
      stopCamera();
    },
    onOutput: (source) => {
      lensCanvas = source;
      $("#lens-empty").hidden = !!source || mode !== "lens";
      $("#lens-preview").hidden = !source;
      output
        .setCanvas(source)
        .catch((error) => ($("#output-status").textContent = error.message));
      draw();
      publish();
    },
  });
  function draw() {
    drawAvatar(canvas, image, layout, pose);
    document.dispatchEvent(
      new CustomEvent("avatar-frame", {
        detail: {
          image,
          layout,
          pose,
          outputCanvas: lensCanvas,
          mode: lensCanvas ? "lens" : "avatar",
        },
      }),
    );
    if (!stream && mode === "png" && $("#align-features").checked) {
      const c = canvas.getContext("2d");
      c.save();
      c.translate(400, 325);
      c.scale(layout.size / 100, layout.size / 100);
      c.setLineDash([6, 6]);
      c.strokeStyle = "#e8d7ff99";
      c.lineWidth = 2;
      for (const [x, y, w, h, show] of [
        [
          layout.eyesX * 4.8,
          (layout.eyesY - 50) * 4.8,
          layout.spacing * 8 + 65,
          70,
          layout.showEyes,
        ],
        [
          layout.mouthX * 4.8,
          (layout.mouthY - 50) * 4.8,
          90,
          70,
          layout.showMouth,
        ],
      ])
        if (show) c.strokeRect(x - w / 2, y - h / 2, w, h);
      c.restore();
    }
  }
  async function publish(extra = {}) {
    // Artwork is only sent when it changes; frequent expression updates stay small.
    if (extra.avatar !== undefined) {
      await fetch("/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatar: extra.avatar,
          layout,
          pose,
          outputMode: lensCanvas ? "lens" : "avatar",
        }),
      })
        .then((response) => {
          if (!response.ok) throw Error();
        })
        .catch(() => ($("#status").textContent = "OBS output unavailable"));
      return;
    }
    if (publishing) {
      publishAgain = true;
      return;
    }
    publishing = true;
    try {
      const response = await fetch("/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout,
          pose,
          outputMode: lensCanvas ? "lens" : "avatar",
        }),
      });
      if (!response.ok) throw Error();
      $("#status").textContent = "OBS output available · local connection";
    } catch {
      $("#status").textContent =
        "OBS output unavailable · check the local server";
    } finally {
      publishing = false;
      if (publishAgain) {
        publishAgain = false;
        publishTimer = setTimeout(() => publish(), 20);
      }
    }
  }
  function syncInputs() {
    for (const input of document.querySelectorAll("[data-setting]")) {
      if (input.type === "checkbox")
        input.checked = layout[input.dataset.setting];
      else input.value = layout[input.dataset.setting];
    }
    $("#look-name").value = activeLook.name;
    $("#look-actions").hidden = activeLook.id.startsWith("builtin:");
    $('[data-setting="bodyColor"]').disabled = !!image;
  }
  function savePreferences() {
    localStorage.setItem("simplestream:tracking", JSON.stringify(preferences));
    mapper.settings = { ...preferences };
  }
  async function persistLook() {
    clearTimeout(saveTimer);
    const record = { ...activeLook, layout: { ...layout }, avatar };
    try {
      await saveLook(record);
      const index = looks.findIndex((item) => item.id === record.id);
      if (index < 0) looks.push(record);
      else looks[index] = record;
      activeLook = record;
      localStorage.setItem("simplestream:active-look", record.id);
      $("#current-asset").textContent =
        record.name + " · saved on this computer";
    } catch {
      $("#current-asset").textContent =
        "This look is available for this session; local storage is unavailable.";
    }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistLook(), 300);
  }
  function renderLooks() {
    const host = $("#saved-looks");
    host.replaceChildren();
    for (const look of looks.filter(
      (item) => !item.id.startsWith("builtin:"),
    )) {
      const button = document.createElement("button");
      button.className =
        "look" + (activeLook.id === look.id ? " selected" : "");
      const img = document.createElement("img");
      img.src = look.avatar;
      img.alt = "";
      img.className = "look-thumb";
      const text = document.createElement("span"),
        name = document.createElement("strong"),
        detail = document.createElement("small");
      name.textContent = look.name;
      detail.textContent = "Your saved character";
      text.append(name, detail);
      button.append(img, text);
      button.onclick = () => selectLook(look);
      host.append(button);
    }
    for (const button of document.querySelectorAll("[data-look]"))
      button.classList.toggle(
        "selected",
        activeLook.id === "builtin:" + button.dataset.look,
      );
  }
  async function selectLook(record, { savePrevious = true } = {}) {
    const generation = ++selectionGeneration;
    if (savePrevious) await persistLook();
    let nextImage = null;
    try {
      if (record.avatar) {
        nextImage = new Image();
        nextImage.src = record.avatar;
        await nextImage.decode();
      }
      const checked = validateState(
        {
          layout: { ...defaultLayout },
          pose: { ...neutralPose },
          avatar: null,
        },
        {
          layout: { ...defaultLayout, ...record.layout },
          avatar: record.avatar,
        },
      );
      if (generation !== selectionGeneration) return;
      activeLook = { ...record };
      layout = checked.layout;
      avatar = checked.avatar;
      image = nextImage;
      pose = { ...neutralPose };
      localStorage.setItem("simplestream:active-look", record.id);
      $("#current-asset").textContent =
        record.name + " · saved on this computer";
      syncInputs();
      renderLooks();
      draw();
      await publish({ avatar });
    } catch {
      message("This saved look could not be loaded. Import the PNG again.");
    }
  }
  for (const input of document.querySelectorAll("[data-setting]"))
    input.addEventListener("input", () => {
      layout[input.dataset.setting] =
        input.type === "checkbox"
          ? input.checked
          : input.type === "range"
            ? Number(input.value)
            : input.value;
      draw();
      publish();
      scheduleSave();
    });
  for (const button of document.querySelectorAll("[data-look]"))
    button.onclick = () =>
      selectLook(
        looks.find((item) => item.id === "builtin:" + button.dataset.look) ||
          builtins.find((item) => item.id === "builtin:" + button.dataset.look),
      );
  $("#upload").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.type !== "image/png" || file.size > 4000000)
        throw Error("Choose a PNG smaller than 4 MB.");
      if (looks.filter((item) => !item.id.startsWith("builtin:")).length >= 32)
        throw Error(
          "Your library holds 32 custom looks. Delete a look before adding another.",
        );
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.src = data;
      await img.decode();
      if (img.width > 4096 || img.height > 4096)
        throw Error("Use a PNG no larger than 4096 × 4096.");
      const record = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.png$/i, "").slice(0, 60) || "My character",
        avatar: data,
        layout: { ...defaultLayout },
      };
      await persistLook();
      await selectLook(record, { savePrevious: false });
      await persistLook();
      renderLooks();
      message(
        "PNG saved. Drag its eyes and mouth into position, then start tracking.",
      );
    } catch (error) {
      message(error.message || "Could not open this PNG.");
    } finally {
      event.target.value = "";
    }
  };
  $("#save-look").onclick = async () => {
    activeLook.name =
      $("#look-name").value.trim().slice(0, 60) || "My character";
    await persistLook();
    renderLooks();
  };
  $("#delete-look").onclick = async () => {
    if (activeLook.id.startsWith("builtin:")) return;
    clearTimeout(saveTimer);
    const id = activeLook.id;
    await deleteLook(id);
    looks = looks.filter((item) => item.id !== id);
    await selectLook(
      looks.find((item) => item.id === "builtin:cat") || builtins[0],
      { savePrevious: false },
    );
  };
  $("#reset").onclick = () => {
    layout = {
      ...defaultLayout,
      character: activeLook.layout.character || "cat",
      bodyColor: activeLook.layout.bodyColor || defaultLayout.bodyColor,
    };
    pose = { ...neutralPose };
    syncInputs();
    draw();
    publish();
    scheduleSave();
  };
  $("#align-features").onchange = draw;
  let dragging = null;
  canvas.onpointerdown = (event) => {
    if (stream || mode !== "png" || !$("#align-features").checked) return;
    const rect = canvas.getBoundingClientRect(),
      scale = Math.min(rect.width / 800, rect.height / 650);
    const x =
        (event.clientX - rect.left - (rect.width - 800 * scale) / 2) / scale -
        400,
      y =
        (event.clientY - rect.top - (rect.height - 650 * scale) / 2) / scale -
        325;
    const px = x / (layout.size / 100),
      py = y / (layout.size / 100);
    if (
      layout.showEyes &&
      Math.abs(py - (layout.eyesY - 50) * 4.8) < 40 &&
      Math.abs(px - layout.eyesX * 4.8) < layout.spacing * 4 + 40
    )
      dragging = "eyes";
    else if (
      layout.showMouth &&
      Math.abs(py - (layout.mouthY - 50) * 4.8) < 40 &&
      Math.abs(px - layout.mouthX * 4.8) < 60
    )
      dragging = "mouth";
    if (dragging) {
      canvas.setPointerCapture(event.pointerId);
      pose = { ...neutralPose };
    }
  };
  canvas.onpointermove = (event) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect(),
      scale = Math.min(rect.width / 800, rect.height / 650),
      x =
        ((event.clientX - rect.left - (rect.width - 800 * scale) / 2) / scale -
          400) /
        (layout.size / 100),
      y =
        ((event.clientY - rect.top - (rect.height - 650 * scale) / 2) / scale -
          325) /
        (layout.size / 100);
    layout[dragging + "X"] = Math.max(-40, Math.min(40, Math.round(x / 4.8)));
    layout[dragging + "Y"] = Math.max(
      dragging === "eyes" ? 10 : 20,
      Math.min(dragging === "eyes" ? 80 : 90, Math.round(y / 4.8 + 50)),
    );
    syncInputs();
    draw();
    publish();
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    if (dragging) scheduleSave();
    dragging = null;
  };
  function frameLoop(now) {
    if (!stream) return;
    if (
      mode === "png" &&
      tracker &&
      !tracker.busy &&
      !framePending &&
      video.readyState >= 2 &&
      video.currentTime !== lastVideoTime &&
      now - lastFrame >= 1000 / preferences.fps
    ) {
      lastFrame = now;
      lastVideoTime = video.currentTime;
      framePending = true;
      const target = tracker;
      createImageBitmap(video)
        .then((bitmap) => {
          if (target !== tracker || !stream) bitmap.close();
          else target.submit(bitmap, now);
        })
        .catch((error) => message(error.message))
        .finally(() => (framePending = false));
    }
    if (mode === "lens") draw();
    if (mode === "png" && $("#show-camera").checked && video.readyState >= 2) {
      const preview = $("#camera-preview"),
        c = preview.getContext("2d");
      c.save();
      if (preferences.mirror) {
        c.translate(preview.width, 0);
        c.scale(-1, 1);
      }
      c.drawImage(video, 0, 0, preview.width, preview.height);
      if (lastResult?.landmarks) {
        c.fillStyle = "#d4beff";
        for (const index of [1, 33, 133, 263, 362, 152, 10]) {
          const point = lastResult.landmarks[index];
          if (point) {
            c.beginPath();
            c.arc(
              point.x * preview.width,
              point.y * preview.height,
              3,
              0,
              Math.PI * 2,
            );
            c.fill();
          }
        }
      }
      c.restore();
    }
    if (now - lastStat >= 1000) {
      $("#tracking-fps-value").textContent =
        mode === "png" ? String(processed) : "—";
      processed = 0;
      lastStat = now;
    }
    frame = requestAnimationFrame(frameLoop);
  }
  async function enumerate() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices(),
        select = $("#camera-device");
      select.replaceChildren(new Option("Default camera", ""));
      for (const device of devices.filter((item) => item.kind === "videoinput"))
        select.append(
          new Option(
            device.label || `Camera ${select.options.length}`,
            device.deviceId,
          ),
        );
      select.value = preferences.deviceId;
      if (select.selectedIndex < 0) {
        preferences.deviceId = "";
        select.value = "";
      }
    } catch {}
  }
  async function stopCamera() {
    cancelAnimationFrame(frame);
    tracker?.stop();
    tracker = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    lastResult = null;
    pose = { ...neutralPose };
    $("#camera").textContent =
      mode === "png" ? "◎ Start face tracking" : "◎ Start lens camera";
    $("#tracking-status").textContent = "Camera off";
    $("#face-state").textContent = "Camera off";
    $("#tracking-fps-value").textContent = "—";
    $("#mouth-value").textContent = "0%";
    $("#blink-value").textContent = "0%";
    $("#camera-preview").hidden = true;
    await snap.stop().catch(() => {});
    lensCanvas = null;
    $("#lens-preview").hidden = true;
    $("#lens-empty").hidden = mode !== "lens";
    draw();
    publish();
  }
  async function startCamera() {
    if (starting) return;
    if (stream) {
      await stopCamera();
      message("Camera stopped. Your saved look is ready for next time.");
      return;
    }
    starting = true;
    $("#camera").disabled = true;
    for (const button of document.querySelectorAll("[data-mode]"))
      button.disabled = true;
    $("#camera-device").disabled = true;
    $("#camera-quality").disabled = true;
    $("#mirror-camera").disabled = true;
    $("#tracking-status").textContent =
      mode === "png" ? "Loading tracker…" : "Loading Camera Kit…";
    try {
      if (mode === "lens") {
        await snap.ensureKit();
        if (!selectedLens) {
          await loadLenses();
          if (!selectedLens)
            throw Error("Choose a lens from your library first.");
        }
      }
      const dimensions =
        preferences.quality === "hd"
          ? { width: 1280, height: 720 }
          : { width: 640, height: 480 };
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: dimensions.width },
          height: { ideal: dimensions.height },
          frameRate: { ideal: 30, max: 30 },
          ...(preferences.deviceId
            ? { deviceId: { exact: preferences.deviceId } }
            : {}),
        },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      stream.getVideoTracks()[0].addEventListener(
        "ended",
        () => {
          stopCamera();
          message("Camera disconnected. Reconnect it and start again.");
        },
        { once: true },
      );
      await enumerate();
      if (mode === "png") {
        mapper = new PoseMapper(preferences);
        tracker = new FaceTracker(
          (result) => {
            if(!stream||mode!=='png')return;
            lastResult = result;
            processed++;
            const mapped = mapper.update(
              result,
              result.timestamp,
              video.videoWidth,
              video.videoHeight,
            );
            pose = mapped.pose;
            $("#tracking-status").textContent = mapped.calibrating
              ? "Calibrating…"
              : mapped.found
                ? "● Tracking"
                : "Looking for a face";
            $("#face-state").textContent = mapped.found
              ? "Face found · worker"
              : "No face detected";
            $("#mouth-value").textContent = Math.round(pose.mouth * 100) + "%";
            $("#blink-value").textContent =
              Math.round(Math.max(pose.left, pose.right) * 100) + "%";
            if (mapped.calibrated)
              message("Calibrated. Your neutral pose is centered.");
            draw();
            publish();
          },
          (error) => {
            message(error.message);
            stopCamera();
          },
        );
        await tracker.start();
        $("#camera").textContent = "■ Stop tracking";
        $("#camera-preview").hidden = !$("#show-camera").checked;
        message(
          "Tracking locally. Look straight ahead and use Center & calibrate for the best fit.",
        );
      } else {
        const old = $("#lens-preview"),
          target = document.createElement("canvas");
        target.id = "lens-preview";
        target.width = 1280;
        target.height = 720;
        target.hidden = true;
        target.setAttribute("aria-label", "Camera Kit lens preview");
        old.replaceWith(target);
        await snap.start(stream, target, preferences.mirror);
        if (!(await applyLens(selectedLens)))
          throw Error(
            "The lens could not be started. Check its Camera Kit compatibility.",
          );
        $("#camera").textContent = "■ Stop lens camera";
        $("#tracking-status").textContent = "● Lens active";
      }
      lastFrame = 0;
      lastVideoTime = -1;
      lastStat = performance.now();
      processed = 0;
      frame = requestAnimationFrame(frameLoop);
    } catch (error) {
      await stopCamera();
      message(
        error.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access in Windows privacy settings, then try again."
          : error.name === "NotReadableError"
            ? "This camera is busy or unavailable. Deactivate it in other camera apps and try again."
            : error.name === "OverconstrainedError"
              ? "The selected camera is unavailable. Choose Default camera and try again."
              : `Could not start: ${error.message}`,
      );
    } finally {
      starting = false;
      $("#camera").disabled = false;
      for (const button of document.querySelectorAll("[data-mode]"))
        button.disabled = false;
      $("#camera-device").disabled = false;
      $("#camera-quality").disabled = false;
      $("#mirror-camera").disabled = false;
    }
  }
  $("#camera").onclick = startCamera;
  $("#calibrate").onclick = () => {
    if (!tracker || !lastResult?.landmarks?.length) {
      message("Start tracking with your face visible before calibrating.");
      return;
    }
    mapper.calibrate();
    message(
      "Look straight ahead, keep your eyes open, and relax your mouth for a moment.",
    );
  };
  $("#show-camera").onchange = () =>
    ($("#camera-preview").hidden =
      !stream || mode !== "png" || !$("#show-camera").checked);
  for (const [id, key] of [
    ["tracking-smoothing", "smoothing"],
    ["tracking-mouth", "mouthGain"],
    ["tracking-eyes", "eyeGain"],
    ["tracking-motion", "motion"],
    ["tracking-fps", "fps"],
  ]) {
    $("#" + id).value = preferences[key];
    $("#" + id).oninput = () => {
      preferences[key] = Number($("#" + id).value);
      savePreferences();
    };
  }
  $("#mirror-camera").checked = preferences.mirror;
  $("#mirror-camera").onchange = async () => {
    preferences.mirror = $("#mirror-camera").checked;
    savePreferences();
    if (stream && mode === "lens") {
      await stopCamera();
      message("Mirror setting saved. Start the lens camera again to apply it.");
    }
  };
  $("#camera-quality").value = preferences.quality;
  $("#camera-quality").onchange = async () => {
    preferences.quality = $("#camera-quality").value;
    savePreferences();
    if (stream) await stopCamera();
    message("Camera quality saved. Start the camera to apply it.");
  };
  $("#camera-device").onchange = async () => {
    preferences.deviceId = $("#camera-device").value;
    savePreferences();
    if (stream) await stopCamera();
    message("Camera selected. Start the camera when ready.");
  };
  navigator.mediaDevices?.addEventListener("devicechange", enumerate);
  for (const button of document.querySelectorAll("[data-expression]"))
    button.onclick = () => {
      if (stream) {
        message("Stop tracking before testing an expression.");
        return;
      }
      pose = {
        ...neutralPose,
        ...({
          blink: { left: 1, right: 1 },
          talk: { mouth: 0.8 },
          smile: { smile: 1, brow: 0.2 },
          turn: { yaw: 0.5, pitch: 0.15, roll: 0.12 },
        }[button.dataset.expression] || {}),
      };
      draw();
      publish();
    };
  for (const label of document.querySelectorAll(
    'label[for="upload"],.toolbar label',
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
  async function switchMode(next) {
    if (mode === next || starting) return;
    await stopCamera();
    mode = next;
    for (const button of document.querySelectorAll("[data-mode]")) {
      const selected = button.dataset.mode === mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    for (const element of document.querySelectorAll("[data-png-only]"))
      element.hidden = mode !== "png";
    for (const element of document.querySelectorAll("[data-lens-only]"))
      element.hidden = mode !== "lens";
    canvas.hidden = mode !== "png";
    $("#lens-empty").hidden = mode !== "lens";
    $("#preview-title").textContent =
      mode === "png" ? "Avatar studio" : "Lens camera";
    $("#preview-subtitle").textContent =
      mode === "png"
        ? "Blink, talk, and move. Your character follows."
        : "Pick a lens from your Camera Kit project.";
    $("#engine-status").textContent =
      mode === "png" ? "MediaPipe · local" : "Snap Camera Kit";
    $("#stage-output-kind").textContent =
      mode === "png" ? "TRANSPARENT OUTPUT" : "LIVE CAPTURE OUTPUT";
    $("#stage-caption").textContent =
      mode === "png"
        ? "Align your features, then let your expressions do the talking."
        : "Your webcam appears only after a lens starts successfully.";
    $("#camera").textContent =
      mode === "png" ? "◎ Start face tracking" : "◎ Start lens camera";
    $("#output-instructions").textContent =
      mode === "png"
        ? "Add a Browser Source at 800 × 650. Keep SimpleStream open while streaming."
        : "Add a Browser Source at 1280 × 720. Lens video stays on a local connection; keep SimpleStream open.";
    $("#output-status").textContent =
      mode === "png"
        ? "PNG output uses a transparent canvas."
        : "Lens video connects after a lens starts successfully.";
    message(
      mode === "png"
        ? "Choose a character, align its features, and start tracking."
        : "Set up Camera Kit, load your lens library, and choose a lens.",
    );
    draw();
  }
  for (const button of document.querySelectorAll("[data-mode]"))
    button.onclick = () => switchMode(button.dataset.mode);
  async function configStatus() {
    try {
      const info = await snap.loadConfig();
      $("#camera-kit-status").textContent = info.configured
        ? "Configuration saved · " + info.groupIds.length + " Lens Group(s)"
        : "Developer setup required";
      $("#snap-group-ids").value = info.groupIds.join("\n");
      $("#snap-api-token").value = "";
      return info;
    } catch (error) {
      $("#camera-kit-status").textContent = error.message;
      return { configured: false, groupIds: [] };
    }
  }
  $("#configure-snap").onclick = async () => {
    await configStatus();
    $("#snap-config-error").textContent = window.avatarTools
      ? ""
      : "Use the desktop app to save Camera Kit configuration securely.";
    $("#camera-kit-dialog").showModal();
  };
  $("#snap-origin").textContent = location.origin;
  $("#open-snap-portal").onclick = () =>
    window.avatarTools?.openSetup("portal");
  $("#open-lens-studio").onclick = () =>
    window.avatarTools?.openSetup("studio");
  $("#camera-kit-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      if (!window.avatarTools)
        throw Error("Secure Camera Kit setup requires the desktop app.");
      await stopCamera();
      await window.avatarTools.saveConfig({
        apiToken: $("#snap-api-token").value,
        groupIds: $("#snap-group-ids")
          .value.split(/[\s,]+/)
          .filter(Boolean),
      });
      await snap.reset();
      await configStatus();
      selectedLens = null;
      lenses = [];
      renderLenses();
      $("#camera-kit-dialog").close();
      message(
        "Camera Kit settings saved. Load your lenses to connect to Snap.",
      );
    } catch (error) {
      $("#snap-config-error").textContent = error.message;
    }
  };
  $("#clear-snap").onclick = async () => {
    await stopCamera();
    await window.avatarTools?.clearConfig();
    await snap.reset();
    await configStatus();
    selectedLens = null;
    lenses = [];
    renderLenses();
    $("#snap-config-error").textContent = "Saved Camera Kit settings removed.";
    message("Camera Kit settings removed. Set up a project to use lenses.");
  };
  function renderLenses() {
    const host = $("#lens-list"),
      query = $("#lens-search").value.toLowerCase().trim();
    host.replaceChildren();
    for (const lens of lenses.filter((lens) =>
      (lens.name || lens.id).toLowerCase().includes(query),
    )) {
      const button = document.createElement("button");
      button.className =
        "lens-choice" + (selectedLens?.id === lens.id ? " selected" : "");
      const name = document.createElement("strong"),
        detail = document.createElement("small");
      name.textContent = lens.name || "Untitled lens";
      detail.textContent = lens.id;
      button.append(name, detail);
      button.onclick = async () => {
        if (starting) return;
        selectedLens = lens;
        renderLenses();
        if (stream && mode === "lens") await applyLens(lens);
        else
          message(
            (lens.name || "Lens") +
              " selected. Start the lens camera to use it.",
          );
      };
      host.append(button);
    }
  }
  async function loadLenses() {
    try {
      $("#load-lenses").disabled = true;
      $("#lens-library-status").textContent = "Connecting to Camera Kit…";
      const result = await snap.loadLibrary();
      lenses = result.lenses;
      selectedLens =
        lenses.find(
          (lens) => lens.id === localStorage.getItem("simplestream:last-lens"),
        ) || lenses[0];
      renderLenses();
      $("#lens-library-status").textContent =
        lenses.length +
        " lenses available" +
        (result.errors?.length ? " · some groups could not load" : "");
      return true;
    } catch (error) {
      $("#lens-library-status").textContent = error.message;
      message(error.message);
      return false;
    } finally {
      $("#load-lenses").disabled = false;
    }
  }
  async function applyLens(lens) {
    try {
      if ((await snap.apply(lens)) === false) return false;
      localStorage.setItem("simplestream:last-lens", lens.id);
      $("#tracking-status").textContent = "● Lens active";
      message(
        (lens.name || "Lens") + " is live. OBS receives the capture output.",
      );
      renderLenses();
      return true;
    } catch (error) {
      await stopCamera();
      message("Lens could not start: " + error.message);
      return false;
    }
  }
  $("#load-lenses").onclick = loadLenses;
  $("#lens-search").oninput = renderLenses;
  $("#custom-lens-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const lens = await snap.loadCustom(
        $("#custom-lens-id").value.trim(),
        $("#custom-lens-group").value.trim(),
      );
      if (!lenses.some((item) => item.id === lens.id)) lenses.push(lens);
      selectedLens = lens;
      renderLenses();
      if (stream && mode === "lens") await applyLens(lens);
      else message("Lens loaded. Start the lens camera to use it.");
    } catch (error) {
      message(error.message);
    }
  };
  $("#overlay-url").textContent = location.origin + "/overlay.html";
  $("#copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("#overlay-url").textContent);
      $("#copy").textContent = "Copied ✓";
      document.dispatchEvent(
        new CustomEvent("setup-progress", { detail: "output" }),
      );
      setTimeout(() => ($("#copy").textContent = "Copy URL"), 1800);
    } catch {
      message("Select and copy the OBS URL above.");
    }
  };
  window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer);
    clearTimeout(publishTimer);
    cancelAnimationFrame(frame);
    tracker?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    output.close();
    snap.stop().catch(() => {});
  });
  try {
    looks = await listLooks();
    const id = localStorage.getItem("simplestream:active-look"),
      record = looks.find((item) => item.id === id) || builtins[0];
    await selectLook(record, { savePrevious: false });
  } catch {
    syncInputs();
    renderLooks();
    draw();
    publish({ avatar });
  }
  await configStatus();
  await enumerate();
}
