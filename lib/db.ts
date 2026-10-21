// lib/db.ts — một kết nối Prisma dùng chung cho cả app (Prisma 7: kết nối qua driver adapter)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = g.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
