import * as THREE from 'three';
import { heightAt, WATER_Y, START_VILLAGE } from '../world/world';
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

export class FlyCam {
  readonly camera: THREE.PerspectiveCamera;
  x = START_VILLAGE.x - 40; z = START_VILLAGE.z + 150;
  yaw = 0; agl = 9; ground = 8;
  speed = 3; roll = 0; pitch = -0.14;
  // mục tiêu do quà / autopilot
  yawT = 0; altT = 9;
  boostT = 0; boostSpeed = 12; warpT = 0;
  private vYaw = { v: 0 }; private vAlt = { v: 0 }; private vSpd = { v: 0 }; private vG = { v: 0 }; private vRoll = { v: 0 };
  private time = 0;
  private lastCmd = -999; // thời điểm có quà gần nhất
  autopilot = true;
  onEvent: (msg: string) => void = () => {};
  readonly baseSpeed = 3;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    // nhìn về làng khởi đầu (hướng -z lệch phải một chút để thấy núi + trăng)
    this.yaw = Math.atan2(-(START_VILLAGE.x - this.x), -(START_VILLAGE.z - this.z)) - 0.05;
    this.yawT = this.yaw;
    this.ground = Math.max(heightAt(this.x, this.z), WATER_Y);
  }

  get yawRate() { return this.vYaw.v; }

  command(cmd: Cmd, n = 1) {
    n = clamp(n, 1, 8);
    this.lastCmd = this.time;
    switch (cmd) {
      case 'left': this.yawT += 0.55 * Math.min(n, 3); break;
      case 'right': this.yawT -= 0.55 * Math.min(n, 3); break;
      case 'up': this.altT = clamp(this.altT + 14 * n, 4, 120); break;
      case 'down': this.altT = clamp(this.altT - 10 * n, 4, 120); break;
      case 'forward': this.boostT = Math.min(this.boostT + 6 * n, 40); this.boostSpeed = 12; break;
      case 'turn180': this.yawT += Math.PI; break;
      case 'warp': this.warpT = 11; this.boostT = 11; this.boostSpeed = 60; this.altT = 55; break;
    }
    // giới hạn góc chờ để camera không xoay quá nhiều vòng
    this.yawT = clamp(this.yawT, this.yaw - 3.3, this.yaw + 3.3);
  }

  private fwd(a: number, d: number): [number, number] { return [this.x - Math.sin(a) * d, this.z - Math.cos(a) * d]; }
  private gAt(x: number, z: number) { return Math.max(heightAt(x, z), WATER_Y); }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const t = this.time;

    // cảnh vật tự trôi: hơi uốn lượn khi rảnh
    if (this.autopilot && Math.abs(this.yawT - this.yaw) < 0.4)
      this.yawT += (0.035 * Math.sin(t * 0.07) + 0.03 * Math.sin(t * 0.031 + 1.3)) * dt;

    // tránh núi cao: nếu phía trước dốc lên quá thì nhẹ nhàng rẽ sang hướng thấp hơn
    // chỉ tự tránh núi khi lâu rồi không có quà: người chơi chủ động bay lên núi thì cứ để họ đi
    if (this.autopilot && this.warpT <= 0 && this.time - this.lastCmd > 60) {
      const here = this.ground;
      const [fx, fz] = this.fwd(this.yaw, 230);
      const ahead = this.gAt(fx, fz);
      if (ahead - here > 70 + this.agl * 0.5) {
        let best = 1e9, bestA = 0;
        for (const da of [-1.4, -0.9, -0.45, 0.45, 0.9, 1.4]) {
          const [px, pz] = this.fwd(this.yaw + da, 230);
          const h = this.gAt(px, pz) + Math.abs(da) * 12;
          if (h < best) { best = h; bestA = da; }
        }
        this.yawT += Math.sign(bestA) * 0.22 * dt;
      }
    }

    // hết warp -> hạ độ cao về bình thường
    if (this.warpT > 0) { this.warpT -= dt; if (this.warpT <= 0) { this.altT = 9; this.onEvent('Đã đến vùng đất mới 🌄'); } }
    if (this.boostT > 0) this.boostT -= dt;

    const prevYaw = this.yaw;
    this.yaw = damp(this.yaw, this.yawT, this.vYaw, 2.3, dt, 0.45);
    const yawRate = (this.yaw - prevYaw) / Math.max(dt, 1e-4);

    const spdT = this.boostT > 0 ? this.boostSpeed : this.baseSpeed;
    this.speed = damp(this.speed, spdT, this.vSpd, this.warpT > 0 ? 2.2 : 1.6, dt);
    this.agl = damp(this.agl, this.altT, this.vAlt, 2.4, dt, 8);

    const nx = this.x - Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z - Math.cos(this.yaw) * this.speed * dt;
    this.x = nx; this.z = nz;

    // bám địa hình: nhìn trước để leo kịp sườn dốc
    let g = this.gAt(this.x, this.z);
    for (const d of [20, 45, 80, 120]) {
      const [px, pz] = this.fwd(this.yaw, d + this.speed * 1.2);
      g = Math.max(g, this.gAt(px, pz) - d * 0.12);
    }
    const gTarget = g;
    this.ground = damp(this.ground, gTarget, this.vG, gTarget > this.ground ? 0.9 : 2.8, dt);
    let y = this.ground + this.agl + Math.sin(t * 0.45) * 0.18;
    y = Math.max(y, this.gAt(this.x, this.z) + 3.2);

    // nghiêng máy bay khi cua + cúi xuống nhiều hơn khi ở cao
    const rollT = clamp(yawRate * 0.55, -0.16, 0.16);
    this.roll = damp(this.roll, rollT, this.vRoll, 0.7, dt);
    const pitchT = -(0.13 + 0.30 * smooth(10, 90, this.agl)) + Math.sin(t * 0.31) * 0.006 - clamp(this.vAlt.v * 0.006, -0.05, 0.05);
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 1.5);

    const c = this.camera;
    c.position.set(this.x, y, this.z);
    c.rotation.order = 'YXZ';
    c.rotation.set(this.pitch, this.yaw, this.roll);
  }
}
