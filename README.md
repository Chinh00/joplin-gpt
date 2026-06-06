# Joplin GPT Assistant

Plugin Joplin TypeScript giúp gọi OpenAI-compatible Chat Completions API để xử lý note hiện tại.

## Tính năng

- `GPT: Tóm tắt note`: thêm phần tóm tắt vào cuối note hiện tại.
- `GPT: Viết lại note rõ hơn`: thêm bản viết lại có cấu trúc hơn.
- Cấu hình trong `Tools > Options > Joplin GPT Assistant`.
- Hỗ trợ OpenAI API hoặc provider tương thích endpoint `/chat/completions`.

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

- API base URL: `https://api.openai.com/v1`
- Model: `gpt-4.1-mini`

Bạn có thể đổi sang provider tương thích OpenAI bằng cách chỉnh `API base URL` và `Model`.
