export const defaultLayout = {
  eyesY: 43,
  eyesX: 0,
  mouthY: 65,
  mouthX: 0,
  spacing: 20,
  size: 100,
  eyeScale: 100,
  mouthScale: 100,
  showEyes: true,
  showMouth: true,
  character: "cat",
  bodyColor: "#b4a0fa",
  eyeStyle: "round",
};
export const neutralPose = {
  mouth: 0,
  left: 0,
  right: 0,
  roll: 0,
  yaw: 0,
  pitch: 0,
  moveX: 0,
  moveY: 0,
  smile: 0,
  gazeX: 0,
  gazeY: 0,
  brow: 0,
};
export const poseRanges = {
  mouth: [0, 1],
  left: [0, 1],
  right: [0, 1],
  roll: [-0.6, 0.6],
  yaw: [-0.7, 0.7],
  pitch: [-0.5, 0.5],
  moveX: [-1, 1],
  moveY: [-1, 1],
  smile: [0, 1],
  gazeX: [-1, 1],
  gazeY: [-1, 1],
  brow: [0, 1],
};
export const layoutRanges = {
  eyesY: [10, 80],
  eyesX: [-40, 40],
  mouthY: [20, 90],
  mouthX: [-40, 40],
  spacing: [5, 40],
  size: [50, 130],
  eyeScale: [40, 180],
  mouthScale: [40, 180],
};
export function validateState(previous, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid state");
  // Artwork is immutable. Do not copy a multi-megabyte PNG on every pose update.
  const next = { ...previous, layout: { ...previous.layout }, pose: { ...previous.pose } };
  if (input.avatar !== undefined) {
    if (
      input.avatar !== null &&
      !(
        typeof input.avatar === "string" &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.avatar)
      )
    )
      throw Error("PNG required");
    next.avatar = input.avatar;
  }
  for (const [key, ranges] of Object.entries({
    pose: poseRanges,
    layout: layoutRanges,
  })) {
    if (input[key] === undefined) continue;
    if (
      !input[key] ||
      typeof input[key] !== "object" ||
      Array.isArray(input[key])
    )
      throw Error("Invalid " + key);
    for (const [name, [min, max]] of Object.entries(ranges)) {
      const value = input[key][name];
      if (value !== undefined) {
        if (!Number.isFinite(value) || value < min || value > max)
          throw Error("Invalid " + name);
        next[key][name] = value;
      }
    }
  }
  if (input.layout) {
    for (const key of ["showEyes", "showMouth"])
      if (input.layout[key] !== undefined) {
        if (typeof input.layout[key] !== "boolean")
          throw Error("Invalid toggle");
        next.layout[key] = input.layout[key];
      }
    for (const [key, choices] of Object.entries({
      character: ["cat", "ghost", "robot"],
      eyeStyle: ["round", "soft", "line"],
    }))
      if (input.layout[key] !== undefined) {
        if (!choices.includes(input.layout[key])) throw Error("Invalid style");
        next.layout[key] = input.layout[key];
      }
    if (input.layout.bodyColor !== undefined) {
      if (!/^#[a-f0-9]{6}$/i.test(input.layout.bodyColor))
        throw Error("Invalid color");
      next.layout.bodyColor = input.layout.bodyColor;
    }
  }
  if (input.outputMode !== undefined) {
    if (!["avatar", "lens"].includes(input.outputMode))
      throw Error("Invalid output");
    next.outputMode = input.outputMode;
  }
  return next;
}
