import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultLayout,
  neutralPose,
  validateState,
} from "../public/avatar-state.js";
import { PoseMapper } from "../public/modules/pose-mapper.js";
import { SnapLenses } from "../public/modules/snap-lenses.js";
function face(scores = {}, offset = 0) {
  const landmarks = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  landmarks[1] = { x: 0.5 + offset, y: 0.55 };
  landmarks[33] = { x: 0.35, y: 0.4 };
  landmarks[263] = { x: 0.65, y: 0.4 };
  landmarks[152] = { x: 0.5, y: 0.8 };
  return { landmarks, scores };
}
test("expressions map to normalized, mirrored avatar motion and decay after tracking is lost", () => {
  const mapper = new PoseMapper({ smoothing: 0, mirror: false });
  let result = mapper.update(
    face(
      {
        jawOpen: 0.5,
        eyeBlinkLeft: 0.9,
        mouthSmileLeft: 0.6,
        mouthSmileRight: 0.6,
      },
      0.07,
    ),
    100,
    640,
    480,
  );
  assert.equal(result.pose.mouth, 0.9);
  assert.equal(result.pose.left, 1);
  assert.equal(result.pose.right, 0);
  assert.ok(result.pose.yaw > 0);
  assert.ok(result.pose.smile > 0.9);
  result = mapper.update({ landmarks: [] }, 200, 640, 480);
  assert.equal(result.pose.mouth, 0.9);
  result = mapper.update({ landmarks: [] }, 600, 640, 480);
  assert.deepEqual(result.pose, neutralPose);
  const mirrored = new PoseMapper({ smoothing: 0, mirror: true }).update(
    face({ eyeBlinkLeft: 0.9 }, 0.07),
    100,
    640,
    480,
  ).pose;
  assert.equal(mirrored.right, 1);
  assert.equal(mirrored.left, 0);
  assert.ok(mirrored.yaw < 0);
});
test("calibration subtracts the neutral expression and smoothing softens sudden changes", () => {
  const mapper = new PoseMapper({ smoothing: 0 });
  mapper.calibrate();
  let result;
  for (let i = 1; i <= 15; i++)
    result = mapper.update(
      face({ jawOpen: 0.2, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }, 0.04),
      i * 33,
      640,
      480,
    );
  assert.equal(result.calibrated, true);
  assert.equal(result.pose.mouth, 0);
  assert.ok(Math.abs(result.pose.moveX) < 1e-10);
  result = mapper.update(
    face({ jawOpen: 0.5, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }, 0.04),
    550,
    640,
    480,
  );
  assert.ok(Math.abs(result.pose.mouth - 0.54) < 0.001);
  const smooth = new PoseMapper({ smoothing: 150 });
  const first = smooth.update(face({ jawOpen: 0.5 }), 100, 640, 480);
  assert.ok(first.pose.mouth > 0 && first.pose.mouth < 0.9);
});
test("avatar state accepts supported features, rejects malformed values, and updates atomically", () => {
  const original = {
    avatar: null,
    layout: { ...defaultLayout },
    pose: { ...neutralPose },
    outputMode: "avatar",
  };
  const next = validateState(original, {
    layout: {
      character: "robot",
      showEyes: false,
      eyeScale: 140,
      bodyColor: "#aabbcc",
    },
    pose: { yaw: 0.4, smile: 0.8 },
  });
  assert.equal(next.layout.showEyes, false);
  assert.equal(next.pose.yaw, 0.4);
  assert.equal(original.layout.character, "cat");
  for (const bad of [
    { layout: { eyeScale: 900 } },
    { layout: { showEyes: 1 } },
    { layout: { bodyColor: "url(bad)" } },
    { pose: { yaw: Infinity } },
    { pose: [] },
    { outputMode: "camera" },
    { layout: { eyesY: 45, mouthY: 999 } },
  ])
    assert.throws(() => validateState(original, bad));
  assert.equal(original.layout.eyesY, 43);
});
test("Camera Kit adapter publishes the capture target only after a lens applies, and fails closed", async () => {
  const actions = [],
    outputs = [],
    live = {},
    capture = {};
  let fail = false;
  const source = {
    setRenderSize: async (w, h) => actions.push(`size:${w}x${h}`),
  };
  const session = {
    events: new EventTarget(),
    output: { live, capture },
    setSource: async () => actions.push("source"),
    applyLens: async () => {
      if (fail) throw Error("Lens failed");
      actions.push("apply");
    },
    play: async (target) => actions.push("play:" + target),
    pause: async () => actions.push("pause"),
    destroy: async () => actions.push("destroy"),
  };
  const kit = {
    createSession: async () => session,
    destroy: async () => {},
    lensRepository: {
      loadLensGroups: async () => ({
        lenses: [{ id: "fixture-lens", name: "Fixture" }],
      }),
      loadLens: async () => ({ id: "fixture-lens" }),
    },
  };
  const adapter = new SnapLenses({
    onError: () => {},
    onOutput: (value) => outputs.push(value),
    loadSdk: async () => ({
      bootstrapCameraKit: async () => kit,
      createMediaStreamSource: () => source,
      Transform2D: { MirrorX: "mirror" },
    }),
  });
  adapter.config = {
    apiToken: "synthetic-camera-kit-token",
    groupIds: ["fixture-group"],
  };
  await adapter.loadLibrary();
  await adapter.start({}, {});
  assert.deepEqual(outputs, []);
  await adapter.apply({ id: "fixture-lens" });
  assert.equal(outputs.at(-1), capture);
  assert.ok(actions.indexOf("apply") < actions.indexOf("play:capture"));
  fail = true;
  await assert.rejects(adapter.apply({ id: "bad" }));
  assert.equal(outputs.at(-1), null);
  assert.equal(actions.at(-1), "pause");
  await adapter.stop();
  assert.equal(actions.at(-1), "destroy");
  const unconfigured = new SnapLenses({
    onError: () => {},
    onOutput: () => {},
  });
  await assert.rejects(unconfigured.ensureKit(), /Set up Camera Kit/);
});
