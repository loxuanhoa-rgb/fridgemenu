// lib/auth.ts — lấy người dùng đang đăng nhập và đồng bộ sang bảng User của mình (cùng id với Supabase)
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

// cache(): trong 1 request gọi nhiều lần cũng chỉ truy vấn 1 lần
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.email) return null;

  const id = claims.sub;
  const name = (claims.user_metadata?.name as string | undefined) ?? null;

  // Lần đầu đăng nhập: tạo User kèm 1 hộ gia đình và 1 tủ lạnh mặc định
  return db.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      email: claims.email,
      name,
      members: {
        create: {
          isOwner: true,
          household: {
            create: {
              name: `Nhà của ${name ?? claims.email}`,
              fridges: { create: { name: "Tủ lạnh chính" } },
            },
          },
        },
      },
    },
  });
});

// Dùng trong trang / action bắt buộc đăng nhập
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
