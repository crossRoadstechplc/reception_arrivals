import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/permissions";
import { homePath } from "@/lib/roles";

const ERRORS: Record<string, string> = {
  AccessDenied: "This account is turned off. Ask your super admin to turn it back on.",
  CredentialsSignin: "That email and password don't match.",
  Configuration: "Sign-in is not configured yet.",
  Default: "Something went wrong signing in. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  try {
    const user = await getCurrentUser();
    if (user) redirect(homePath(user.role));
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
  }

  const params = await searchParams;
  const banner = params.error ? ERRORS[params.error] || ERRORS.Default : undefined;

  return (
    <AuthShell>
      <LoginForm banner={banner} />
    </AuthShell>
  );
}
