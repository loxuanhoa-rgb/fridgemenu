// lib/week.ts — xử lý ngày theo giờ Việt Nam, dạng chuỗi "YYYY-MM-DD"
// (máy chủ deploy thường chạy giờ UTC, nên không dùng new Date() trực tiếp để lấy "hôm nay")

const VN_TZ = "Asia/Ho_Chi_Minh";

export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now); // "2026-10-22"
}

export function isDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// Chuỗi ngày <-> Date lưu vào cột @db.Date (luôn ở 00:00 UTC)
export const toDbDate = (day: string) => new Date(`${day}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number) {
  const d = toDbDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDbDate(d);
}

// Thứ Hai của tuần chứa ngày `day`
export function mondayOf(day: string) {
  const dow = toDbDate(day).getUTCDay(); // 0 = Chủ nhật
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export function weekDays(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const DAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// "T2 20/10"
export function dayLabel(day: string) {
  const d = toDbDate(day);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

const FULL_DAY_NAMES = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

// "Thứ Năm, 22/10/2026"
export function fullDayLabel(day: string) {
  const d = toDbDate(day);
  return `${FULL_DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

export const MEALS = [
  { type: "BREAKFAST", label: "Sáng" },
  { type: "LUNCH", label: "Trưa" },
  { type: "SNACK", label: "Phụ" },
  { type: "DINNER", label: "Tối" },
] as const;

export type MealTypeValue = (typeof MEALS)[number]["type"];
