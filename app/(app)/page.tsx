import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ageFromBirthYear, dailyEnergy, energyForGoal, macroTargets } from "@/lib/nutrition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phần đọc phiên đăng nhập chạy lúc request, nên phải nằm trong <Suspense> (cacheComponents)
async function Dashboard() {
  const user = await requireUser();
  const profile = await db.healthProfile.findUnique({ where: { userId: user.id } });

  if (!profile) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name ?? user.email}</h1>
        <p className="text-muted-foreground">
          Hãy{" "}
          <Link href="/profile" className="text-foreground underline">
            điền hồ sơ sức khỏe
          </Link>{" "}
          để app tính nhu cầu dinh dưỡng mỗi ngày cho bạn.
        </p>
      </>
    );
  }

  const tdee = dailyEnergy({ ...profile, age: ageFromBirthYear(profile.birthYear) });
  const kcal = energyForGoal(tdee, profile.goal);
  const macro = macroTargets(kcal);

  return (
    <>
      <h1 className="text-2xl font-semibold">Xin chào, {user.name ?? user.email}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Nhu cầu mỗi ngày</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Năng lượng" value={kcal} unit="kcal" />
          <Stat label="Chất đạm" value={macro.proteinG} unit="g" />
          <Stat label="Chất béo" value={macro.fatG} unit="g" />
          <Stat label="Bột đường" value={macro.carbG} unit="g" />
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {value} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Đang tải...</p>}>
      <Dashboard />
    </Suspense>
  );
}
