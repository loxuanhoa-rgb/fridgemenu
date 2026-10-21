"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export type ProfileState = { error?: string; saved?: boolean };

const thisYear = new Date().getFullYear();

const Profile = z.object({
  birthYear: z.coerce
    .number()
    .int()
    .min(thisYear - 100, "Năm sinh không hợp lệ")
    .max(thisYear - 2, "Năm sinh không hợp lệ"),
  sex: z.enum(["MALE", "FEMALE"], "Hãy chọn giới tính"),
  weightKg: z.coerce.number().min(10, "Cân nặng phải từ 10 kg").max(300, "Cân nặng tối đa 300 kg"),
  heightCm: z.coerce.number().min(50, "Chiều cao phải từ 50 cm").max(250, "Chiều cao tối đa 250 cm"),
  activityLevel: z.coerce.number().min(1.2).max(1.9),
  goal: z.enum(["giam_can", "giu_can", "tang_can"]),
  // "tôm, đậu phộng" -> ["tôm", "đậu phộng"]
  allergies: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
    ),
});

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = Profile.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.healthProfile.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: { userId: user.id, ...parsed.data },
  });
  revalidatePath("/");
  revalidatePath("/profile");
  return { saved: true };
}
