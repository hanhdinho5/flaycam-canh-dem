import * as THREE from 'three';
import { heightAt, WATER_Y, forestDensity, villagesNear, mountainMask, type Village } from '../world/world';
import { clamp, smooth } from './rand';
import type { Cmd } from '../../shared/giftmap';

// smoothDamp kiểu Unity: tiến tới mục tiêu mượt, không giật
function damp(cur: number, target: number, vel: { v: number }, smoothTime: number, dt: number, maxSpeed = Infinity) {
  const om = 2 / Math.max(0.0001, smoothTime), x = om * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = cur - target;
  const maxC = maxSpeed * smoothTime;
  change = clamp(change, -maxC, maxC);
  const t = cur - change;
  const tmp = (vel.v + om * change) * dt;
  vel.v = (vel.v - om * tmp) * e;
  let out = t + (change + tmp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; vel.v = (out - target) / dt; }
  return out;
}
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export type Kind = 'village' | 'forest' | 'lake' | 'ridge' | 'meadow';
interface Way { x: number; z: number; kind: Kind; agl: number; village?: Village; t0: number }
const SHOT: Record<Kind, { agl: number; speed: number; fov: number; msg: string }> = {
  village: { agl: 15, speed: 3.0, fov: 62, msg: '🏡 Ghé thăm một ngôi làng' },
  forest:  { agl: 22, speed: 3.4, fov: 66, msg: '🌲 Bay qua rừng thông' },
  lake:    { agl: 6,  speed: 3.0, fov: 68, msg: '🌊 Lướt trên mặt hồ' },
  ridge:   { agl: 38, speed: 3.8, fov: 72, msg: '⛰️ Vượt qua dãy núi' },
  meadow:  { agl: 9,  speed: 3.0, fov: 66, msg: '🌾 Bay qua đồng cỏ' },
};
const ORBIT_R = 72, ORBIT_S = 30, MANUAL_S = 25;

export class FlyCam {
  readonly camera: THREE.PerspectiveCamera;
  x = 0; z = 0;
  yaw = 0; lookOff = 0; agl = 9; ground = 8;
  speed = 3; roll = 0; pitch = -0.14; fov = 66;
  yawT = 0; altT = 9;
  boostT = 0; boostSpeed = 12; warpT = 0;
  kind: Kind | 'manual' = 'meadow';
  private way: Way | null = null;
  private orbit: { v: Village; t0: number; dir: number } | null = null;
  private recent: { x: number; z: number; kind: Kind }[] = [];
  private dirSpeed = 3;
  private lookT = 0; private fovT = 66;
  private vYaw = { v: 0 }; private vAlt = { v: 0 }; private vSpd = { v: 0 }; private vG = { v: 0 };
  private vRoll = { v: 0 }; private vLook = { v: 0 }; private vFov = { v: 0 };
  private time = 0;
  private lastCmd = -999;
  autopilot = true;
  onEvent: (msg: string) => void = () => {};
  readonly baseSpeed = 3;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Đặt camera tại điểm bắt đầu của một không gian, nhìn về (lx,lz). 8 giây đầu bay thẳng, rồi đạo diễn tự lái. */
  teleport(x: number, z: number, lx: number, lz: number, agl = 9) {
    this.x = x; this.z = z;
    this.yaw = Math.atan2(-(lx - x), -(lz - z)) - 0.05; this.yawT = this.yaw; this.lookOff = 0;
    this.ground = Math.max(heightAt(x, z), WATER_Y); this.agl = this.altT = agl;
    this.speed = this.dirSpeed = this.baseSpeed; this.boostT = 0; this.warpT = 0;
    this.way = null; this.orbit = null; this.recent = [];
    for (const v of [this.vYaw, this.vAlt, this.vSpd, this.vG, this.vRoll, this.vLook, this.vFov]) v.v = 0;
    this.lastCmd = this.time - MANUAL_S + 8;
    this.kind = 'manual';
  }

  get yawRate() { return this.vYaw.v; }
  get manual() { return this.time - this.lastCmd < MANUAL_S || this.warpT > 0; }

  command(cmd: Cmd, n = 1) {
    n = clamp(n, 1, 8);
    this.lastCmd = this.time; this.way = null; this.orbit = null; this.kind = 'manual';
    switch (cmd) {
      case 'left': this.yawT += 0.55 * Math.min(n, 3); break;
      case 'right': this.yawT -= 0.55 * Math.min(n, 3); break;
      case 'up': this.altT = clamp(this.altT + 14 * n, 4, 120); break;
      case 'down': this.altT = clamp(this.altT - 10 * n, 4, 120); break;
      case 'forward': this.boostT = Math.min(this.boostT + 6 * n, 40); this.boostSpeed = 12; break;
      case 'turn180': this.yawT += Math.PI; break;
      case 'warp': this.warpT = 11; this.boostT = 11; this.boostSpeed = 60; this.altT = 55; break;
    }
    this.yawT = clamp(this.yawT, this.yaw - 3.3, this.yaw + 3.3);
  }

  private fwd(a: number, d: number): [number, number] { return [this.x - Math.sin(a) * d, this.z - Math.cos(a) * d]; }
  private gAt(x: number, z: number) { return Math.max(heightAt(x, z), WATER_Y); }
  private bearing(tx: number, tz: number) { return Math.atan2(-(tx - this.x), -(tz - this.z)); }

  // ───────── đạo diễn: chọn điểm đến thú vị rồi bay tới ─────────
  private pickWaypoint(): Way {
    let best: Way | null = null, bestScore = -1e9;
    const h0 = this.ground;
    for (let i = 0; i < 30; i++) {
      const da = (Math.random() - 0.5) * 2 * 2.0;                       // ±115° quanh hướng đang bay
      const d = 330 + Math.random() * 600;
      const ang = this.yaw + da;
      let [x, z] = this.fwd(ang, d);
      let score = Math.random() * 0.5 + Math.cos(da) * 0.35;
      let maxH = -1e9;                                                    // độ cao phải vượt dọc đường
      for (let s = 1; s <= 8; s++) { const [px, pz] = this.fwd(ang, (d * s) / 8); maxH = Math.max(maxH, this.gAt(px, pz)); }
      const climb = maxH - h0;
      if (climb > 170) continue;
      score -= Math.max(0, climb - 70) / 160;
      const vs = villagesNear(x, z, 110).filter(v => Math.hypot(v.x - x, v.z - z) < 110);
      const fd = forestDensity(x, z), m = mountainMask(x, z), h = this.gAt(x, z);
      let water = 0;
      for (let a = 0; a < 6; a++) if (heightAt(x + Math.cos(a * 1.047) * 60, z + Math.sin(a * 1.047) * 60) < 0) water++;
      let kind: Kind = 'meadow';
      let village: Village | undefined;
      if (vs.length) { kind = 'village'; village = vs[0]; x = village.x; z = village.z; score += 2.0; }
      else if (water >= 2 || h < 0.2) { kind = 'lake'; score += 1.4; }
      else if (fd > 0.55) { kind = 'forest'; score += 1.2; }
      else if (m > 0.25 && h > 55) { kind = 'ridge'; score += 1.0; }
      if (this.recent.length && this.recent[this.recent.length - 1].kind === kind) score -= 0.9;   // đa dạng loại cảnh
      if (this.recent.some(r => Math.hypot(r.x - x, r.z - z) < 320)) score -= 1.5;                  // tránh chỗ vừa ghé
      if (score > bestScore) { bestScore = score; best = { x, z, kind, agl: SHOT[kind].agl, village, t0: this.time }; }
    }
    if (!best) { // kẹt giữa núi: quay lưng lại
      const [x, z] = this.fwd(this.yaw + Math.PI, 450);
      best = { x, z, kind: 'meadow', agl: SHOT.meadow.agl, t0: this.time };
    }
    this.recent.push({ x: best.x, z: best.z, kind: best.kind }); if (this.recent.length > 6) this.recent.shift();
    this.onEvent(SHOT[best.kind].msg);
    return best;
  }

  private direct() {
    const t = this.time;
    if (this.orbit) { // vòng quanh làng, mắt luôn nhìn về làng
      const o = this.orbit, v = o.v;
      const b = this.bearing(v.x, v.z), dist = Math.hypot(v.x - this.x, v.z - this.z);
      const k = clamp((dist - ORBIT_R) / 70, -0.7, 0.7);
      this.yawT = this.yaw + wrap(b + o.dir * (Math.PI / 2 - k) - this.yaw);
      this.lookT = clamp(wrap(b - this.yaw), -1.25, 1.25);
      this.altT = SHOT.village.agl + 3 * Math.sin(t * 0.3);
      this.dirSpeed = SHOT.village.speed; this.fovT = SHOT.village.fov; this.kind = 'village';
      if (t - o.t0 > ORBIT_S) { this.orbit = null; this.way = null; }
      return;
    }
    if (!this.way) this.way = this.pickWaypoint();
    const w = this.way, dist = Math.hypot(w.x - this.x, w.z - this.z);
    if (w.village && dist < ORBIT_R + 30) { this.orbit = { v: w.village, t0: t, dir: Math.random() < 0.5 ? 1 : -1 }; this.way = null; return; }
    if (!w.village && dist < 55) { this.way = null; return; }
    if (t - w.t0 > 170) { this.way = null; return; }
    this.yawT = this.yaw + wrap(this.bearing(w.x, w.z) - this.yaw);
    this.altT = w.agl; this.kind = w.kind;
    this.dirSpeed = SHOT[w.kind].speed; this.fovT = SHOT[w.kind].fov;
    this.lookT = (w.kind === 'lake' ? 0.4 : 0.14) * Math.sin(t * (w.kind === 'lake' ? 0.11 : 0.08)); // góc nhìn quét nhẹ
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const t = this.time;

    if (this.autopilot && !this.manual) this.direct();
    else {
      // điều khiển bằng quà: giữ hướng, trôi nhẹ
      this.lookT = 0; this.fovT = 66; this.dirSpeed = this.baseSpeed;
      if (this.kind !== 'manual') { this.way = null; this.orbit = null; this.kind = 'manual'; }
      if (Math.abs(this.yawT - this.yaw) < 0.4)
        this.yawT += (0.035 * Math.sin(t * 0.07) + 0.03 * Math.sin(t * 0.031 + 1.3)) * dt;
    }

    if (this.warpT > 0) {
      this.warpT -= dt;
      if (this.warpT <= 0) { this.altT = 9; this.lastCmd = t - MANUAL_S + 5; this.onEvent('🌄 Đã đến vùng đất mới'); }
    }
    if (this.boostT > 0) this.boostT -= dt;

    const prevYaw = this.yaw;
    this.yaw = damp(this.yaw, this.yawT, this.vYaw, 2.3, dt, 0.45);
    const yawRate = (this.yaw - prevYaw) / Math.max(dt, 1e-4);
    this.lookOff = damp(this.lookOff, this.lookT, this.vLook, 2.2, dt);
    this.fov = damp(this.fov, this.fovT, this.vFov, 2.5, dt);

    const spdT = this.boostT > 0 ? this.boostSpeed : this.dirSpeed;
    this.speed = damp(this.speed, spdT, this.vSpd, this.warpT > 0 ? 2.2 : 1.8, dt);

    // trên rừng thì bay cao hơn tán cây
    let forest = 0;
    for (const d of [0, 30, 70]) { const [px, pz] = this.fwd(this.yaw, d); forest = Math.max(forest, forestDensity(px, pz)); }
    this.agl = damp(this.agl, Math.max(this.altT, 11 + 12 * smooth(0.25, 0.6, forest)), this.vAlt, 2.4, dt, 8);

    this.x -= Math.sin(this.yaw) * this.speed * dt;
    this.z -= Math.cos(this.yaw) * this.speed * dt;

    // bám địa hình: nhìn trước để leo kịp sườn dốc / vượt đồi núi
    let g = this.gAt(this.x, this.z);
    for (const d of [20, 45, 80, 120, 170]) {
      const [px, pz] = this.fwd(this.yaw, d + this.speed * 1.2);
      g = Math.max(g, this.gAt(px, pz) - d * 0.12);
    }
    this.ground = damp(this.ground, g, this.vG, g > this.ground ? 0.9 : 2.8, dt);
    const y = Math.max(this.ground + this.agl + Math.sin(t * 0.45) * 0.18, this.gAt(this.x, this.z) + 3.2);

    this.roll = damp(this.roll, clamp(yawRate * 0.55, -0.16, 0.16), this.vRoll, 0.7, dt);
    const pitchT = -(0.13 + 0.30 * smooth(10, 90, this.agl)) + Math.sin(t * 0.31) * 0.006
      - clamp(this.vAlt.v * 0.006, -0.05, 0.05) - (this.kind === 'lake' ? 0.04 : 0);
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 1.5);

    const c = this.camera;
    c.position.set(this.x, y, this.z);
    c.rotation.order = 'YXZ';
    c.rotation.set(this.pitch, this.yaw + this.lookOff, this.roll);
  }
}
