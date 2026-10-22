"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applySuggestion, generateSuggestion, rateSuggestion, type SuggestionView } from "./ai-actions";

export function AiPanel(props: { day: string; dayLabel: string; configured: boolean; remaining: number; canWeek: boolean }) {
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<SuggestionView | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rated, setRated] = useState<number | null>(null);

  function generate(mode: "day" | "week") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await generateSuggestion(mode, props.day);
      if (r.error) return setError(r.error);
      setSuggestion(r.suggestion!);
      setKept(new Set(r.suggestion!.days.flatMap((d) => d.meals.map((m) => m.key))));
      setRated(null);
    });
  }

  function apply() {
    if (!suggestion) return;
    startTransition(async () => {
      const r = await applySuggestion(suggestion.id, [...kept]);
      if (r.error) return setError(r.error);
      setNotice(`Đã thêm ${r.added} món vào thực đơn.`);
      setSuggestion(null);
    });
  }

  function toggle(key: string) {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>✨ AI gợi ý thực đơn</CardTitle>
        <CardDescription>
          AI chọn món từ danh sách công thức, ưu tiên đồ trong tủ lạnh và đồ sắp hết hạn, bỏ món có chất gây dị
          ứng. Chỉ điền các bữa còn trống.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!props.configured ? (
          <p className="text-sm text-muted-foreground">
            Chưa cấu hình AI. Thêm <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> vào file{" "}
            <code className="rounded bg-muted px-1">.env</code> rồi khởi động lại server.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => generate("day")} disabled={pending || props.remaining === 0}>
              Gợi ý cho {props.dayLabel}
            </Button>
            {props.canWeek && (
              <Button variant="outline" onClick={() => generate("week")} disabled={pending || props.remaining === 0}>
                Gợi ý các ngày còn lại trong tuần
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Còn {props.remaining} lượt hôm nay</span>
          </div>
        )}

        {pending && !suggestion && (
          <p className="text-sm text-muted-foreground" role="status">
            AI đang lên thực đơn và kiểm tra dinh dưỡng... (có thể mất 30–60 giây)
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

        {suggestion && (
          <div className="flex flex-col gap-4">
            {suggestion.summary && <p className="text-sm">{suggestion.summary}</p>}

            {suggestion.days.map((d) => {
              const diff = Math.round(((d.kcal - suggestion.target) / suggestion.target) * 100);
              return (
                <section key={d.date} className="flex flex-col gap-2 rounded-lg border p-3">
                  <h3 className="flex justify-between gap-2 text-sm font-semibold">
                    {d.label}
                    <span
                      className={`font-normal tabular-nums ${Math.abs(diff) > 10 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {d.kcal} / {suggestion.target} kcal ({diff > 0 ? "+" : ""}
                      {diff}%)
                    </span>
                  </h3>
                  {d.meals.length === 0 && <p className="text-sm text-muted-foreground">Không thêm món nào.</p>}
                  {d.meals.map((m) => (
                    <label key={m.key} className="flex cursor-pointer gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={kept.has(m.key)}
                        onChange={() => toggle(m.key)}
                        className="mt-1 size-4 accent-[var(--primary)]"
                      />
                      <span>
                        <span className="font-medium">{m.mealLabel}:</span>{" "}
                        {m.recipes.map((r) => `${r.name} (${r.kcal} kcal)`).join(" + ")}
                        <span className="block text-xs text-muted-foreground">{m.reason}</span>
                      </span>
                    </label>
                  ))}
                </section>
              );
            })}

            {suggestion.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <p className="font-medium">Sau {suggestion.attempts} lần thử, gợi ý vẫn chưa đạt hết yêu cầu:</p>
                <ul className="list-disc pl-4">
                  {suggestion.warnings.slice(0, 5).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={apply} disabled={pending || kept.size === 0}>
                Lưu {kept.size} bữa vào thực đơn
              </Button>
              <Button variant="ghost" onClick={() => setSuggestion(null)} disabled={pending}>
                Bỏ qua
              </Button>
              <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
                Gợi ý có hữu ích?
                {[
                  { v: 5, label: "👍", aria: "Hữu ích" },
                  { v: 1, label: "👎", aria: "Không hữu ích" },
                ].map((b) => (
                  <Button
                    key={b.v}
                    size="icon-sm"
                    variant={rated === b.v ? "secondary" : "ghost"}
                    aria-label={b.aria}
                    aria-pressed={rated === b.v}
                    onClick={() => {
                      setRated(b.v);
                      void rateSuggestion(suggestion.id, b.v);
                    }}
                  >
                    {b.label}
                  </Button>
                ))}
              </span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Gợi ý mang tính tham khảo, không thay thế tư vấn của chuyên gia dinh dưỡng. Số liệu dinh dưỡng do app tính
          từ Bảng thành phần thực phẩm Việt Nam, không do AI đưa ra.
        </p>
      </CardContent>
    </Card>
  );
}
