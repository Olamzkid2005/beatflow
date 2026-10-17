import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "History · BeatFlow" },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
