import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthLoading } from "@/components/auth-loading";
import { getSessionRestoreState } from "@/lib/auth/restore";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Restore an existing session on a hard load/refresh before rendering the
  // login form. The client form still re-checks the session for bfcache and
  // for tabs that were already open when the user signed in elsewhere.
  const session = await getSessionRestoreState();
  if (session.status === "authenticated") {
    redirect(session.destination);
  }

  return (
    <Suspense fallback={<AuthLoading fullScreen />}>
      <LoginForm />
    </Suspense>
  );
}
