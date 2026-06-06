# Joplin GPT Assistant

Plugin Joplin TypeScript giúp gọi OpenAI-compatible Chat Completions API để xử lý note hiện tại.

## Tính năng

- `GPT: Tóm tắt note`: thêm phần tóm tắt vào cuối note hiện tại.
- `GPT: Viết lại note rõ hơn`: thêm bản viết lại có cấu trúc hơn.
- Cấu hình trong `Tools > Options > Joplin GPT Assistant`.
- Hỗ trợ OpenAI API, 9Router, hoặc provider tương thích endpoint `/chat/completions`.

## Cài đặt phát triển

```bash
npm install
npm run dist
```

File plugin được build tại:

```text
publish/com.personal.joplin-gpt-assistant.jpl
```

## Cài vào Joplin

1. Mở Joplin Desktop.
2. Vào `Tools > Options > Plugins > Install from file`.
3. Chọn file `.jpl` trong thư mục `publish`.
4. Restart Joplin nếu được yêu cầu.
5. Vào `Tools > Options > Joplin GPT Assistant` và nhập API key.

## Cấu hình mặc định

- Provider: `OpenAI`
- API base URL: `https://api.openai.com/v1`
- 9Router base URL: `http://localhost:20128/v1`
- Model: `gpt-4.1-mini`

## Dùng với 9Router

1. Chạy 9Router local gateway trên máy của bạn.
2. Trong Joplin, vào `Tools > Options > Joplin GPT Assistant`.
3. Đổi `Provider` thành `9Router`.
4. Giữ `9Router base URL` là `http://localhost:20128/v1` nếu bạn dùng cấu hình local mặc định.
5. Chỉnh `Model` thành model mà 9Router của bạn expose.
6. Có thể để trống `API key` nếu 9Router local không bật auth.

Bạn vẫn có thể dùng provider khác bằng cách chọn `Custom OpenAI-compatible` rồi chỉnh `API base URL` và `Model`.

## Publish lên Joplin plugin registry

Joplin tự động index plugin từ npm nếu package có keyword `joplin-plugin` và file build nằm trong thư mục `publish`.

```bash
npm login
npm run dist
npm publish
```

Sau khi publish, plugin sẽ cần một khoảng thời gian để Joplin plugin registry đồng bộ từ npm.
