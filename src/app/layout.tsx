import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Efficio Ponto", template: "%s · Efficio Ponto" },
  description: "Gestão de jornada e cálculo de ponto",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
