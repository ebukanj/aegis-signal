import { redirect } from "next/navigation";

/** The dashboard is the platform's home workspace. */
export default function RootPage() {
  redirect("/dashboard");
}
