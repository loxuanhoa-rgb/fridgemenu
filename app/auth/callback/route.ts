// app/auth/callback/route.ts — người dùng bấm link xác nhận trong email sẽ quay về đây
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  // Mẫu email mặc định gửi ?code=..., mẫu tùy chỉnh gửi ?token_hash=...&type=...
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Thiếu mã xác nhận") };

  return NextResponse.redirect(error ? `${origin}/login?error=confirm` : `${origin}/`);
}
