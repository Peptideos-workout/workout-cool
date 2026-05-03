import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { serverRequiredUser } from "@/entities/user/model/get-server-session-user";

interface RootLayoutProps {
  params: Promise<{ locale: string }>;
  children: ReactNode;
}

export default async function RootLayout({ children, params }: RootLayoutProps) {
  const auth = await serverRequiredUser();
  const { locale } = await params;

  if (auth.emailVerified) {
    redirect(`/${locale}`);
  }

  return children;
}
