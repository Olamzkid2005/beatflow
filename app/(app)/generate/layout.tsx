import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "New upload · BeatFlow" },
};

export default function GenerateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
