// lib/fridge.ts — truy vấn tủ lạnh, luôn kiểm tra tủ thuộc hộ gia đình của người dùng
import { cacheLife } from "next/cache";
import { db } from "@/lib/db";

// Điều kiện "tủ thuộc hộ gia đình có userId là thành viên"
const ownedBy = (userId: string) => ({ household: { members: { some: { userId } } } });

// Tủ lạnh đầu tiên của người dùng (mỗi người được tạo sẵn 1 tủ khi đăng nhập lần đầu)
export function getUserFridge(userId: string) {
  return db.fridge.findFirst({ where: ownedBy(userId), orderBy: { name: "asc" } });
}

export function userOwnsFridge(userId: string, fridgeId: string) {
  return db.fridge.count({ where: { id: fridgeId, ...ownedBy(userId) } }).then((n) => n > 0);
}

export function userOwnsItem(userId: string, itemId: string) {
  return db.fridgeItem
    .count({ where: { id: itemId, fridge: ownedBy(userId) } })
    .then((n) => n > 0);
}

export function getFridgeItems(fridgeId: string) {
  return db.fridgeItem.findMany({
    where: { fridgeId },
    include: { food: { select: { nameVi: true, group: true } } },
    // Đồ có hạn dùng gần nhất lên đầu, đồ không ghi hạn xuống cuối
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { addedAt: "desc" }],
  });
}

// Đồ sắp hết hạn trong `days` ngày (kể cả đồ đã quá hạn)
export function expiringSoon(fridgeId: string, days = 3) {
  const limit = new Date(Date.now() + days * 864e5);
  return db.fridgeItem.findMany({
    where: { fridgeId, expiresAt: { lte: limit } },
    include: { food: true },
    orderBy: { expiresAt: "asc" },
  });
}

// Tổng số gam từng thực phẩm đang có trong tủ (bỏ qua đồ đã quá hạn)
export async function fridgeStock(fridgeId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rows = await db.fridgeItem.groupBy({
    by: ["foodId"],
    where: { fridgeId, OR: [{ expiresAt: null }, { expiresAt: { gte: today } }] },
    _sum: { quantityG: true },
  });
  return new Map(rows.map((r) => [r.foodId, r._sum.quantityG ?? 0]));
}

// Danh sách thực phẩm ít thay đổi → cache lại, không phải truy vấn mỗi lần mở trang
export async function getFoodOptions() {
  "use cache";
  cacheLife("hours");
  return db.food.findMany({ select: { id: true, nameVi: true }, orderBy: { nameVi: "asc" } });
}

// Số ngày còn lại tới hạn dùng (âm = đã quá hạn)
export function daysLeft(expiresAt: Date, now = new Date()) {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(expiresAt) - day(now)) / 864e5);
}
