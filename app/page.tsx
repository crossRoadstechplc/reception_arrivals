import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { homePath } from "@/lib/roles";

export default async function Home() {
  try {
    const user = await getCurrentUser();
    redirect(user ? homePath(user.role) : "/login");
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) {
      throw error;
    }
    redirect("/login");
  }
}
