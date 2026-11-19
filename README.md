# Flycam đêm trăng — game TikTok Live

Hai trang:
- **Trang live** `http://localhost:5173/` — chỉ khung dọc 9:16 (mobile). Đây là trang để capture lên live (OBS / TikTok Live Studio, 720×1280, 30fps).
- **Trang điều khiển** `http://localhost:5173/control.html` — nối live TikTok (nhập @username), chạy demo, bay thử, và gán **quà 1 xu** → hướng bay (77 quà lấy từ live-game-cms, lưu vào `server/mapping.json`).

## Chạy
```bash
pnpm install
pnpm start      # server (cổng 8787) + web (cổng 5173)
```
Mặc định: Rose=trái, TikTok=phải, GG=lên, Heart Me=tiến nhanh, Ice Cream Cone=xuống, Thumbs Up=quay đầu.
Quà lớn (≥ 100 xu) không có trong bảng → bay tới vùng mới. Sửa ngưỡng ở `shared/giftmap.ts`.
Cần sign key cho TikTok: `EULER_API_KEY=... pnpm server`.

Phím test trên trang live: A/D rẽ · W nhanh · Q lên · E xuống · R quay đầu · T warp · H ẩn bảng quà.
