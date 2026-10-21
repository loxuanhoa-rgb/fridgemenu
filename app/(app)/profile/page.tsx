import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

async function ProfileSection() {
  const user = await requireUser();
  const profile = await db.healthProfile.findUnique({ where: { userId: user.id } });
  return <ProfileForm initial={profile} />;
}

export default function ProfilePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Hồ sơ sức khỏe</CardTitle>
        <CardDescription>
          Dùng để tính nhu cầu năng lượng (công thức Mifflin–St Jeor) và tránh món có chất gây dị ứng.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-muted-foreground">Đang tải...</p>}>
          <ProfileSection />
        </Suspense>
      </CardContent>
    </Card>
  );
}
