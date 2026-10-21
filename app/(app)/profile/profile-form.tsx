"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfile, type ProfileState } from "./actions";

export type ProfileValues = {
  birthYear: number;
  sex: "MALE" | "FEMALE";
  weightKg: number;
  heightCm: number;
  activityLevel: number;
  goal: string;
  allergies: string[];
};

const ACTIVITY = [
  { value: 1.2, label: "Ít vận động (ngồi văn phòng)" },
  { value: 1.375, label: "Nhẹ (tập 1–3 buổi/tuần)" },
  { value: 1.55, label: "Vừa (tập 3–5 buổi/tuần)" },
  { value: 1.725, label: "Nặng (tập 6–7 buổi/tuần)" },
  { value: 1.9, label: "Rất nặng (lao động chân tay)" },
];

const GOALS = [
  { value: "giam_can", label: "Giảm cân" },
  { value: "giu_can", label: "Giữ cân" },
  { value: "tang_can", label: "Tăng cân" },
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function ProfileForm({ initial }: { initial: ProfileValues | null }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Năm sinh" htmlFor="birthYear">
        <Input id="birthYear" name="birthYear" type="number" defaultValue={initial?.birthYear} required />
      </Field>
      <Field label="Giới tính" htmlFor="sex">
        <select id="sex" name="sex" defaultValue={initial?.sex ?? ""} className={selectClass} required>
          <option value="" disabled>
            Chọn...
          </option>
          <option value="MALE">Nam</option>
          <option value="FEMALE">Nữ</option>
        </select>
      </Field>
      <Field label="Cân nặng (kg)" htmlFor="weightKg">
        <Input id="weightKg" name="weightKg" type="number" step="0.1" defaultValue={initial?.weightKg} required />
      </Field>
      <Field label="Chiều cao (cm)" htmlFor="heightCm">
        <Input id="heightCm" name="heightCm" type="number" step="0.1" defaultValue={initial?.heightCm} required />
      </Field>
      <Field label="Mức vận động" htmlFor="activityLevel">
        <select
          id="activityLevel"
          name="activityLevel"
          defaultValue={initial?.activityLevel ?? 1.375}
          className={selectClass}
        >
          {ACTIVITY.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mục tiêu" htmlFor="goal">
        <select id="goal" name="goal" defaultValue={initial?.goal ?? "giu_can"} className={selectClass}>
          {GOALS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Dị ứng (cách nhau bằng dấu phẩy)" htmlFor="allergies">
          <Input
            id="allergies"
            name="allergies"
            placeholder="tôm, đậu phộng"
            defaultValue={initial?.allergies.join(", ")}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu hồ sơ"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.saved && !pending && <p className="text-sm text-muted-foreground">Đã lưu.</p>}
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
