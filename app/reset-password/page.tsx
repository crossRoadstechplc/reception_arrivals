import { ResetPasswordForm } from "@/app/reset-password/reset-form";
import { AuthShell } from "@/components/auth-shell";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell>
      <ResetPasswordForm token={params.token ?? ""} />
    </AuthShell>
  );
}
