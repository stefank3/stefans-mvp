import { redirect } from "next/navigation";

/**
 * Root route (/)
 * Always redirect to /chat so the demo URL is simple.
 */
export default function Home() {
  redirect("/chat");
}
