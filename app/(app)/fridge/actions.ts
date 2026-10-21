"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { userOwnsFridge, userOwnsItem } from "@/lib/fridge";

export type ItemState = { error?: string; ok?: boolean };

// Ô để trống gửi lên chuỗi "" → coi như không nhập
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const Fields = {
  quantityG: z.coerce.number("Số gam không hợp lệ").positive("Số gam phải lớn hơn 0"),
  unitLabel: z.preprocess(blankToUndefined, z.string().trim().max(50).optional()),
  expiresAt: z.preprocess(blankToUndefined, z.coerce.date("Ngày không hợp lệ").optional()),
};

const NewItem = z.object({
  fridgeId: z.uuid(),
  foodName: z.string().trim().min(1, "Hãy chọn thực phẩm"),
  ...Fields,
});

const EditItem = z.object({ id: z.uuid(), ...Fields });

export async function addItem(_: ItemState, form: FormData): Promise<ItemState> {
  const user = await requireUser();
  const parsed = NewItem.safeParse(Object.fromEntries(form)); // sai dữ liệu -> báo lỗi
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { fridgeId, foodName, ...data } = parsed.data;
  if (!(await userOwnsFridge(user.id, fridgeId))) return { error: "Không có quyền với tủ lạnh này" };

  const food = await db.food.findFirst({ where: { nameVi: foodName }, select: { id: true } });
  if (!food) return { error: `Không tìm thấy "${foodName}" — hãy chọn trong danh sách gợi ý` };

  await db.fridgeItem.create({ data: { fridgeId, foodId: food.id, ...data } });
  revalidatePath("/fridge");
  return { ok: true };
}

export async function updateItem(_: ItemState, form: FormData): Promise<ItemState> {
  const user = await requireUser();
  const parsed = EditItem.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...data } = parsed.data;
  if (!(await userOwnsItem(user.id, id))) return { error: "Không có quyền sửa món này" };

  await db.fridgeItem.update({
    where: { id },
    // Ô trống = xóa nhãn / xóa hạn dùng
    data: { ...data, unitLabel: data.unitLabel ?? null, expiresAt: data.expiresAt ?? null },
  });
  revalidatePath("/fridge");
  return { ok: true };
}

export async function deleteItem(id: string) {
  const user = await requireUser();
  if (!(await userOwnsItem(user.id, id))) return;
  await db.fridgeItem.delete({ where: { id } });
  revalidatePath("/fridge");
}
