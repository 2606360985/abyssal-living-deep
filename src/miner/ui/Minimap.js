import './miner.css';

export class Minimap {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'miner-minimap';
    this.canvas.width = 160; this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d');
    document.body.appendChild(this.canvas);
    this.scale = 2.6; // px per metre
    this.contactTimer = 0;
    this.contactPos = null;
  }
  toggle(hidden) { this.canvas.hidden = hidden; }
  update(app) {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#020805cc';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#758b6b40';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const rov = app.rov.root.position;
    const yaw = app.motion.yaw;
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw);
    const toMap = (wx, wz) => {
      const dx = wx - rov.x, dz = wz - rov.z;
      return [cx + (dx * cos - dz * sin) * this.scale, cy + (dx * sin + dz * cos) * this.scale];
    };

    // range rings
    ctx.strokeStyle = '#758b6b22';
    for (const r of [20, 40]) {
      ctx.beginPath(); ctx.arc(cx, cy, r * this.scale, 0, Math.PI * 2); ctx.stroke();
    }

    // nodule field center
    const [fcx, fcy] = toMap(app.field.center.x, app.field.center.z);
    if (fcx > 0 && fcx < w && fcy > 0 && fcy < h) {
      ctx.strokeStyle = '#c5b36c88';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fcx - 4, fcy); ctx.lineTo(fcx + 4, fcy); ctx.moveTo(fcx, fcy - 4); ctx.lineTo(fcx, fcy + 4); ctx.stroke();
    }

    // nodules
    for (const c of app.field.candidates) {
      const [nx, ny] = toMap(c.position.x, c.position.z);
      if (nx < -4 || nx > w + 4 || ny < -4 || ny > h + 4) continue;
      if (c.removed) {
        ctx.fillStyle = '#3a4540';
        ctx.beginPath(); ctx.arc(nx, ny, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a454055';
        ctx.beginPath(); ctx.arc(nx, ny, 2.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        const isHover = app.field.hover === c || app.state.selected === c;
        ctx.fillStyle = isHover ? '#e0d599' : '#c5b36c';
        ctx.beginPath(); ctx.arc(nx, ny, isHover ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // sonar contact (fade over 4s)
    if (app.sonar.snapshot && app.sonar.snapshot.worldPos) {
      this.contactPos = app.sonar.snapshot.worldPos;
      this.contactTimer = 4;
    }
    if (this.contactTimer > 0 && this.contactPos) {
      this.contactTimer -= 0.016;
      const [sx, sy] = toMap(this.contactPos.x, this.contactPos.z);
      const alpha = Math.max(0, this.contactTimer / 4);
      ctx.fillStyle = `rgba(178,214,193,${alpha * 0.8})`;
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(178,214,193,${alpha * 0.3})`;
      ctx.beginPath(); ctx.arc(sx, sy, 3 + (1 - alpha) * 12, 0, Math.PI * 2); ctx.stroke();
    }

    // ROV heading cone
    ctx.fillStyle = '#b4c6bd22';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const fov = 0.6;
    ctx.arc(cx, cy, 28, -Math.PI / 2 - fov, -Math.PI / 2 + fov);
    ctx.closePath(); ctx.fill();

    // ROV triangle
    ctx.fillStyle = '#c4b77a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath(); ctx.fill();

    // label
    ctx.fillStyle = '#526c64';
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('小地图', cx, h - 5);
  }
}
