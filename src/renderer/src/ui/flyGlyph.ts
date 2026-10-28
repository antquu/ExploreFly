/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Top-down fly drawn with straight lines and blocks, in the app's hairline style.

export interface FlyPose {
  x: number;
  y: number;
  heading: number;
  size: number;
  // 0 on the ground, 1 at cruising height
  alt: number;
  // Wing beat and leg phases, in radians
  wing: number;
  legs: number;
  danger?: boolean;
}

const INK = '#ffffff';
const EYE = '#ff5a52';

export function drawFly(g: CanvasRenderingContext2D, p: FlyPose) {
  const s = p.size / 24;
  const flying = p.alt > 0.02;

  // Shadow drops away from the body as the fly gains height
  if (flying) {
    g.save();
    g.translate(p.x + p.alt * 14, p.y + p.alt * 22);
    g.rotate(p.heading);
    g.fillStyle = `rgba(0,0,0,${0.35 - p.alt * 0.15})`;
    g.fillRect(-5 * s, -11 * s, 10 * s, 24 * s);
    g.restore();
  }

  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.heading);
  g.scale(s * (1 + p.alt * 0.25), s * (1 + p.alt * 0.25));
  g.lineWidth = 1.1 / s;
  g.lineJoin = 'miter';
  g.lineCap = 'square';
  g.strokeStyle = p.danger ? EYE : INK;
  // Dark halo keeps the hairlines readable on light pages
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 3;

  // Legs: alternating tripods while walking, tucked in flight
  if (!flying) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const phase = p.legs + (k % 2 === (side > 0 ? 0 : 1) ? 0 : Math.PI);
        const swing = Math.sin(phase) * 2.2;
        const by = -2 + k * 3.2;
        g.beginPath();
        g.moveTo(side * 3, by);
        g.lineTo(side * 7, by - 2 + k * 1.5 + swing * 0.4);
        g.lineTo(side * 9.5, by - 5 + k * 4 + swing);
        g.stroke();
      }
    }
  }

  // Wings: folded over the abdomen at rest, beating and blurred in flight
  const beats = flying ? [0, 0.6, 1.2] : [0];
  for (const lag of beats) {
    const open = flying ? 0.95 + Math.sin(p.wing - lag) * 0.55 : 0.18;
    const alpha = flying ? (lag === 0 ? 0.9 : 0.25) : 0.9;
    for (const side of [-1, 1]) {
      g.save();
      g.translate(side * 2, -1);
      g.rotate(side * open);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(side * 2.5, 3);
      g.lineTo(side * 3, 16);
      g.lineTo(side * 0.5, 17);
      g.closePath();
      g.fillStyle = `rgba(255,255,255,${0.16 * alpha})`;
      g.fill();
      g.globalAlpha = alpha;
      g.stroke();
      g.beginPath();
      g.moveTo(side * 1.2, 2);
      g.lineTo(side * 1.8, 15);
      g.stroke();
      g.restore();
    }
  }
  g.globalAlpha = 1;

  g.fillStyle = '#000';
  // Abdomen with segment lines
  g.fillRect(-3.2, 3, 6.4, 10);
  g.strokeRect(-3.2, 3, 6.4, 10);
  for (let k = 1; k < 4; k++) {
    g.beginPath();
    g.moveTo(-3.2, 3 + k * 2.5);
    g.lineTo(3.2, 3 + k * 2.5);
    g.stroke();
  }
  // Thorax
  g.fillRect(-3.6, -4, 7.2, 7);
  g.strokeRect(-3.6, -4, 7.2, 7);
  // Head and eyes
  g.fillRect(-3.4, -8.2, 6.8, 3.6);
  g.strokeRect(-3.4, -8.2, 6.8, 3.6);
  g.fillStyle = EYE;
  g.fillRect(-4.4, -8.6, 2.4, 3.2);
  g.fillRect(2, -8.6, 2.4, 3.2);
  // Antennae
  g.beginPath();
  g.moveTo(-1, -8.2); g.lineTo(-1.8, -10.5);
  g.moveTo(1, -8.2); g.lineTo(1.8, -10.5);
  g.stroke();
  g.restore();
}

// Square gaze marker with corner brackets
export function drawReticle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const k = r * 0.45;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.moveTo(x + sx * r, y + sy * (r - k));
    g.lineTo(x + sx * r, y + sy * r);
    g.lineTo(x + sx * (r - k), y + sy * r);
  }
  g.stroke();
  g.fillStyle = color;
  g.fillRect(x - 2, y - 2, 4, 4);
}
