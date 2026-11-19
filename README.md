# Flycam đêm trăng — game TikTok Live

Hai trang:
- **Trang live** `http://localhost:5175/` — chỉ khung dọc 9:16 (mobile). Đây là trang để capture lên live (OBS / TikTok Live Studio, 720×1280, 30fps).
- **Trang điều khiển** `http://localhost:5175/control.html` — nối live TikTok (nhập @username), chạy demo, bay thử, và gán **quà 1 xu** → hướng bay (77 quà lấy từ live-game-cms, lưu vào `server/mapping.json`).

## Chạy
```bash
pnpm install
pnpm start      # server (cổng 8787) + web (cổng 5175)
```
Mặc định: Rose=trái, TikTok=phải, GG=lên, Heart Me=tiến nhanh, Ice Cream Cone=xuống, Thumbs Up=quay đầu.
Quà lớn (≥ 100 xu) không có trong bảng → bay tới vùng mới. Sửa ngưỡng ở `shared/giftmap.ts`.
Cần sign key cho TikTok: `EULER_API_KEY=... pnpm server`.

## Ba không gian
1. 🌿 **Đồng cỏ Thụy Sĩ** — đồi cỏ, làng gỗ, cừu bò, trăng cyan, sương thấp.
2. ☁️ **Cao nguyên trên mây** (kiểu Dolomites) — cao nguyên chalet nhìn xuống **biển mây**, vách đá nhọn sáng dưới trăng, bầu trời xanh sẫm.
3. 🌌 **Hồ gương dưới dải ngân hà** — hồ **phản chiếu thật** núi tuyết + trời sao, rừng vân sam đen, cabin gỗ sáng đèn có bến gỗ và khói.

**Đổi không gian:** tặng quà **từ 30 xu trở lên** (ngưỡng ở `shared/giftmap.ts`, `SCENE_MIN_DIAMONDS`), không gian kế tiếp theo vòng, màn hình tối dần rồi bay tới điểm xuất phát mới. Phím test: `N` (kế tiếp), `1` `2` `3` (chọn), hoặc `?scene=2` trong link. Thêm không gian mới: thêm một mục vào `src/scenes.ts`.

## Flycam tự lái (đạo diễn)
Khi không có quà trong 25 giây, flycam tự chọn điểm đến thú vị cách 330–930 m rồi bay tới, đổi góc quay theo từng loại cảnh:
🏡 ghé **làng** (vòng quanh làng, mắt nhìn về làng) · 🌲 bay trên **rừng** thông · 🌊 lướt thấp trên **hồ** (quét ngang) · ⛰️ vượt **dãy núi** (bay cao, góc rộng) · 🌾 qua đồng cỏ.
Nó chọn đường vượt đồi núi (bám địa hình, nhìn trước sườn dốc), tránh chỗ vừa đi qua và tránh lặp liên tiếp một loại cảnh. Có quà → người xem tạm lái (hướng, độ cao, tăng tốc, quay đầu); quà lớn → bay xa tới vùng mới. Người chơi muốn lên núi cao cứ lái lên.
Tên cảnh hiện ở giữa trên màn hình khi chuyển điểm.

## Chạy ổn
- Tự giảm độ phân giải (tối thiểu 50%) khi dưới ~27 FPS và tăng lại khi dư sức. Tắt: `?fixres`. Xem thông số: `?fps`.
- Chất lượng: `?q=low|med|high`. WebGL bị mất thì trang tự tải lại.
- Debug: `?debug` (lộ `window.__fly`), `?nolight=moon,fill,hemi`, `?hide=trees,grass,village,near,far,water,sky`.

Trang điều khiển có mục **Giả lập quà trên màn live**: bấm quà 1 xu đã gán, quà 30 xu (đổi không gian), hoặc chọn thẳng không gian.
Đổi cổng WebSocket nếu 8787 bận: `WS_PORT=8800 pnpm server` và mở trang với `?ws=8800`.

Phím test trên trang live: A/D rẽ · W nhanh · Q lên · E xuống · R quay đầu · T warp · H ẩn bảng quà.
