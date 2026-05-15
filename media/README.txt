วางไฟล์รูปภาพ reward ไว้ที่นี่
รองรับ: PNG, JPG, GIF, WEBP

โครงสร้างโฟลเดอร์:
media/
├── pack_default/
│   ├── reward_1.png
│   └── reward_2.jpg
└── pack_custom/
    └── reward_1.png

ใน settings จะเก็บเป็น path เช่น "pack_default/reward_1.png"
Extension จะโหลดจาก: scripts/extensions/third-party/love-status/media/{path}
