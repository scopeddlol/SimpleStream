import { defaultLayout, neutralPose } from "./avatar-state.js";
export { defaultLayout, neutralPose };
export function drawAvatar(canvas, image, inputLayout, inputPose) {
  const l = { ...defaultLayout, ...inputLayout },
    p = { ...neutralPose, ...inputPose },
    c = canvas.getContext("2d");
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save();
  c.translate(
    canvas.width / 2 + p.moveX * 65,
    canvas.height / 2 + p.moveY * 48,
  );
  c.rotate(p.roll);
  c.scale((l.size / 100) * (1 - Math.abs(p.yaw) * 0.16), l.size / 100);
  if (image) {
    const scale = Math.min(480 / image.width, 480 / image.height);
    c.drawImage(
      image,
      (-image.width * scale) / 2,
      (-image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
  } else {
    c.fillStyle = l.bodyColor;
    if (l.character === "ghost") {
      c.beginPath();
      c.moveTo(-190, 165);
      c.lineTo(-190, -15);
      c.bezierCurveTo(-190, -270, 190, -270, 190, -15);
      c.lineTo(190, 165);
      for (let x = 190; x > -190; x -= 76)
        c.quadraticCurveTo(x - 38, 115, x - 76, 165);
      c.fill();
    } else if (l.character === "robot") {
      c.beginPath();
      c.roundRect(-200, -170, 400, 350, 65);
      c.fill();
      c.strokeStyle = l.bodyColor;
      c.lineWidth = 13;
      c.beginPath();
      c.moveTo(0, -170);
      c.lineTo(0, -215);
      c.stroke();
      c.beginPath();
      c.arc(0, -225, 16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#322744";
      c.beginPath();
      c.roundRect(-165, -100, 330, 190, 30);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(-195, -130);
      c.quadraticCurveTo(-215, -280, -92, -177);
      c.bezierCurveTo(-30, -196, 30, -196, 92, -177);
      c.quadraticCurveTo(215, -280, 195, -130);
      c.bezierCurveTo(260, 140, 145, 214, 0, 214);
      c.bezierCurveTo(-145, 214, -260, 140, -195, -130);
      c.fill();
      c.fillStyle = "#ffffff55";
      for (const x of [-142, 142]) {
        c.beginPath();
        c.ellipse(x, -154, 24, 41, x < 0 ? -0.5 : 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (l.character !== "robot") {
      c.fillStyle = "#efbadb88";
      for (const x of [-125, 125]) {
        c.beginPath();
        c.ellipse(x, 50, 32, 17, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  c.translate(p.yaw * 45, p.pitch * 45);
  const eyeY = (l.eyesY - 50) * 4.8,
    eyeX = l.eyesX * 4.8,
    spacing = l.spacing * 4,
    eyeScale = l.eyeScale / 100;
  if (l.showEyes)
    for (const [x, blink] of [
      [eyeX - spacing, p.left],
      [eyeX + spacing, p.right],
    ]) {
      c.save();
      c.translate(x, eyeY - p.brow * 10);
      c.scale(eyeScale, eyeScale);
      c.fillStyle = l.character === "robot" && !image ? "#d9e4ff" : "#201a32";
      c.strokeStyle = c.fillStyle;
      c.lineWidth = 7;
      c.lineCap = "round";
      if (blink > 0.8 || l.eyeStyle === "line") {
        c.beginPath();
        c.moveTo(-16, 0);
        c.quadraticCurveTo(0, blink > 0.8 ? 6 : -8, 16, 0);
        c.stroke();
      } else {
        c.beginPath();
        c.ellipse(
          p.gazeX * 7,
          p.gazeY * 5,
          l.eyeStyle === "soft" ? 23 : 18,
          Math.max(2, (l.eyeStyle === "soft" ? 18 : 26) * (1 - blink)),
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
        c.fillStyle = "#fff";
        c.beginPath();
        c.ellipse(
          p.gazeX * 7 + 5,
          p.gazeY * 5 - 8,
          5,
          Math.max(0.3, 6 * (1 - blink)),
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      c.restore();
    }
  if (l.showMouth) {
    c.save();
    c.translate(l.mouthX * 4.8, (l.mouthY - 50) * 4.8);
    c.scale(l.mouthScale / 100, l.mouthScale / 100);
    c.strokeStyle = "#201a32";
    c.lineWidth = 7;
    c.lineCap = "round";
    if (p.mouth > 0.1) {
      c.fillStyle = "#33223e";
      c.beginPath();
      c.ellipse(0, 0, 22 + p.smile * 12, 5 + p.mouth * 38, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#db8eb9";
      c.beginPath();
      c.ellipse(
        0,
        p.mouth * 24,
        13,
        Math.max(1, p.mouth * 8),
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(-24, 0);
      c.quadraticCurveTo(0, 15 + p.smile * 16, 24, 0);
      c.stroke();
    }
    c.restore();
  }
  c.restore();
}
