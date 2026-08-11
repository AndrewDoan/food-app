import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Table — recipes & spots, from people you actually know",
  description: "Private recipe and restaurant sharing for your circle.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body className="bg-table-950 text-table-100 font-body min-h-screen">
        {children}
      </body>
    </html>
  );
}
