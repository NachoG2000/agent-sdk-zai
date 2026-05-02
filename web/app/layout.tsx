import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PreOp",
  description: "A personalized film of what is about to happen inside you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
