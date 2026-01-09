"use client";

import * as React from "react";
import {
  AudioWaveform,
  BookOpen,
  Bot,
  Command,
  Frame,
  GalleryVerticalEnd,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
} from "lucide-react";

import { NavMain } from "@/components/layout/nav/nav-main";
import { NavProjects } from "@/components/layout/nav/nav-projects";
import { NavUser } from "@/components/layout/nav/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { supabase } from "../../../lib/supabase/client";
import { useRouter } from "next/navigation";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

// This is sample data.
const data = {
  user: {
    name: "Jesús",
    email: "jesus@vitalitty.com",
    avatar: "/logo_azul.png",
  },
  navMain: [
    {
      title: "Pacientes",
      url: "#",
      icon: SquareTerminal,
      isActive: true,
      items: [
        {
          title: "Resumen global",
          url: "/dashboard",
        },
        {
          title: "Creación de dietas",
          url: "#",
        },
      ],
    },
  ],
};

const goToPage = async (page: string, router: AppRouterInstance) => {
  if (page === "logout") {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={data.user}
          goToProfile={() => goToPage("profile", router)}
          closeSession={() => goToPage("logout", router)}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
