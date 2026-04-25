import { redirect } from "next/navigation";

export default function Home() {
  // Keep the root path as a simple alias.
  // The actual product entry is the family graph view.
  redirect("/family-tree/graph");
}
