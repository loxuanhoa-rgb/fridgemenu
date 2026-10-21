"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeVi } from "@/lib/text";
import type { RecipeSummary } from "@/lib/recipes";

const REGIONS = ["Tất cả", "Bắc", "Trung", "Nam"];

// Tìm kiếm + lọc ngay trên trình duyệt (danh sách món nhỏ, không cần gọi lại server)
export function RecipeBrowser({ recipes }: { recipes: RecipeSummary[] }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("Tất cả");

  const shown = useMemo(() => {
    const q = normalizeVi(query);
    return recipes.filter(
      (r) =>
        (region === "Tất cả" || r.region === region) &&
        (!q || normalizeVi([r.name, ...r.ingredientNames].join(" ")).includes(q))
    );
  }, [recipes, query, region]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên món hoặc nguyên liệu: bún, thịt lợn..."
          aria-label="Tìm công thức"
          className="sm:max-w-sm"
        />
        <div className="flex gap-1" role="group" aria-label="Lọc theo vùng miền">
          {REGIONS.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={region === r ? "default" : "outline"}
              aria-pressed={region === r}
              onClick={() => setRegion(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{shown.length} món</p>

      {shown.length === 0 ? (
        <p className="text-muted-foreground">Không tìm thấy món phù hợp.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recipes/${r.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{r.name}</h2>
                  {r.region && (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {r.region}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{r.kcal} kcal</span>/khẩu phần
                  {" · "}
                  {r.servings} khẩu phần
                  {r.minutes ? ` · ${r.minutes} phút` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
