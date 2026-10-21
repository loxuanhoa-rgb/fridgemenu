import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logout } from "../(auth)/login/actions";

const NAV = [
  { href: "/", label: "Trang chủ" },
  { href: "/fridge", label: "Tủ lạnh" },
  { href: "/recipes", label: "Công thức" },
  { href: "/profile", label: "Hồ sơ sức khỏe" },
];

// Khung chung cho các trang cần đăng nhập (proxy.ts đã chặn người chưa đăng nhập)
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-6 py-3">
          <Link href="/" className="font-semibold">
            FridgeMenu
          </Link>
          <nav className="flex flex-1 gap-3 text-sm text-muted-foreground">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
  );
}
