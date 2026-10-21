// lib/text.ts — xử lý chuỗi, dùng được cả trên server lẫn trình duyệt

// Bỏ dấu để tìm kiếm: "Bún bò" -> "bun bo"
export function normalizeVi(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
