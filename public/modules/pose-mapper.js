import { neutralPose } from "../avatar-state.js";
const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
export const defaultTracking = {
  smoothing: 90,
  mouthGain: 1.8,
  eyeGain: 1.3,
  motion: 1,
  mirror: true,
  fps: 30,
};
export class PoseMapper {
  constructor(settings = {}) {
    this.settings = { ...defaultTracking, ...settings };
    this.pose = { ...neutralPose };
    this.baseline = null;
    this.lastTime = null;
    this.lastFace = 0;
    this.samples = null;
  }
  calibrate() {
    this.samples = [];
  }
  measure(result, width = 640, height = 480) {
    const points = result.landmarks;
    if (!points?.[1] || !points[33] || !points[263] || !points[152])
      return null;
    const a = points[33],
      b = points[263],
      nose = points[1],
      chin = points[152],
      scores = result.scores || {};
    const eyeX = (a.x + b.x) / 2,
      eyeY = (a.y + b.y) / 2;
    return {
      ...scores,
      roll: Math.atan2((b.y - a.y) * height, (b.x - a.x) * width),
      yaw: (nose.x - eyeX) / Math.max(0.04, Math.abs(b.x - a.x)),
      pitch: (nose.y - eyeY) / Math.max(0.04, chin.y - eyeY),
      x: nose.x,
      y: nose.y,
    };
  }
  update(result, now, width, height) {
    const value = this.measure(result, width, height),
      dt = this.lastTime === null ? 33 : clamp(now - this.lastTime, 1, 200);
    this.lastTime = now;
    let target = { ...neutralPose };
    let calibrated = false;
    if (value) {
      this.lastFace = now;
      if (this.samples) {
        this.samples.push(value);
        if (this.samples.length >= 15) {
          this.baseline = {};
          for (const key of Object.keys(value))
            this.baseline[key] =
              this.samples.reduce((sum, item) => sum + (item[key] || 0), 0) /
              this.samples.length;
          this.samples = null;
          calibrated = true;
        }
      }
      const zero = this.baseline || {
          roll: 0,
          yaw: 0,
          pitch: 0.42,
          x: 0.5,
          y: 0.5,
        },
        s = this.settings,
        mirror = s.mirror ? -1 : 1;
      const delta = (key) => (value[key] || 0) - (zero[key] || 0);
      target = {
        mouth: clamp(delta("jawOpen") * s.mouthGain),
        left: clamp(
          (s.mirror ? delta("eyeBlinkRight") : delta("eyeBlinkLeft")) *
            s.eyeGain,
        ),
        right: clamp(
          (s.mirror ? delta("eyeBlinkLeft") : delta("eyeBlinkRight")) *
            s.eyeGain,
        ),
        roll: clamp(delta("roll") * mirror * s.motion, -0.6, 0.6),
        yaw: clamp(delta("yaw") * mirror * 2 * s.motion, -0.7, 0.7),
        pitch: clamp(delta("pitch") * 1.5 * s.motion, -0.5, 0.5),
        moveX: clamp(delta("x") * mirror * 3 * s.motion, -1, 1),
        moveY: clamp(delta("y") * 3 * s.motion, -1, 1),
        smile: clamp(
          (delta("mouthSmileLeft") + delta("mouthSmileRight")) * 0.8,
        ),
        gazeX: clamp(
          ((value.eyeLookOutLeft || 0) -
            (value.eyeLookInLeft || 0) +
            (value.eyeLookInRight || 0) -
            (value.eyeLookOutRight || 0)) *
            mirror,
          -1,
          1,
        ),
        gazeY: clamp(
          ((value.eyeLookDownLeft || 0) +
            (value.eyeLookDownRight || 0) -
            (value.eyeLookUpLeft || 0) -
            (value.eyeLookUpRight || 0)) *
            0.5,
          -1,
          1,
        ),
        brow: clamp(delta("browInnerUp")),
      };
    } else if (this.lastFace && now - this.lastFace < 250) target = this.pose;
    else if (this.samples) this.samples = null;
    const alpha =
      this.settings.smoothing <= 0
        ? 1
        : 1 - Math.exp(-dt / this.settings.smoothing);
    for (const key of Object.keys(neutralPose))
      this.pose[key] += (target[key] - this.pose[key]) * alpha;
    return {
      pose: { ...this.pose },
      found: !!value,
      calibrated,
      calibrating: !!this.samples,
    };
  }
}
