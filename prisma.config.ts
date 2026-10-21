// Cấu hình Prisma 7: chuỗi kết nối CSDL khai báo ở đây (không còn trong schema.prisma)
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Lệnh migrate cần kết nối trực tiếp (Supabase: cổng 5432, không qua pooler)
    url: env("DIRECT_URL"),
  },
});
