"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return <div>FOOTER</div>;
}
