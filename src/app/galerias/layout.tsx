import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Galerías · Visión Pelusa",
  description: "Encontrá tu partido y elegí las fotos que querés llevarte.",
};

export default function GaleriasLayout({ children }: LayoutProps<"/galerias">) {
  return children;
}
