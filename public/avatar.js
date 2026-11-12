export const defaultLayout = { eyesY: 43, mouthY: 65, spacing: 20, size: 100 };
export const neutralPose = { mouth: 0, left: 0, right: 0, roll: 0 };
export function drawAvatar(canvas, image, layout, pose) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.save();
  c.translate(w / 2, h / 2);
  c.rotate(pose.roll);
  c.scale(layout.size / 100, layout.size / 100);
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
    c.fillStyle = "#b4a0fa";
    c.beginPath();
    c.moveTo(-195, -130);
    c.quadraticCurveTo(-215, -280, -92, -177);
    c.bezierCurveTo(-30, -196, 30, -196, 92, -177);
    c.quadraticCurveTo(215, -280, 195, -130);
    c.bezierCurveTo(260, 140, 145, 214, 0, 214);
    c.bezierCurveTo(-145, 214, -260, 140, -195, -130);
    c.fill();
    c.fillStyle = "#d3c4ff";
    for (const x of [-142, 142]) {
      c.beginPath();
      c.ellipse(x, -154, 24, 41, x < 0 ? -0.5 : 0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#e7c2ed";
    for (const x of [-125, 125]) {
      c.beginPath();
      c.ellipse(x, 50, 32, 17, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  const eyeY = (layout.eyesY - 50) * 4.8,
    mouthY = (layout.mouthY - 50) * 4.8,
    spacing = layout.spacing * 4;
  for (const [x, blink] of [
    [-spacing, pose.left],
    [spacing, pose.right],
  ]) {
    c.fillStyle = "#1d1831";
    c.beginPath();
    c.ellipse(x, eyeY, 18, Math.max(2, 26 * (1 - blink)), 0, 0, Math.PI * 2);
    c.fill();
    if (blink < 0.7) {
      c.fillStyle = "#fff";
      c.beginPath();
      c.ellipse(x + 5, eyeY - 8, 5, 6 * (1 - blink), 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.strokeStyle = "#1d1831";
  c.lineWidth = 7;
  c.lineCap = "round";
  if (pose.mouth > 0.12) {
    c.fillStyle = "#33223e";
    c.beginPath();
    c.ellipse(
      0,
      mouthY,
      22 + pose.mouth * 12,
      5 + pose.mouth * 38,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(-24, mouthY);
    c.quadraticCurveTo(0, mouthY + 21, 24, mouthY);
    c.stroke();
  }
  c.restore();
}
