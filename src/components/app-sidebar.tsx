import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Link } from "react-router-dom";

import unicornImg from "@/assets/unicorn.png";

type NavMain = {
  title: string;
  url: string;
  items: {
    title: string;
    url: string;
    onClick?: () => void;
    rightItem?: React.ReactNode;
    isActive?: boolean;
  }[];
}[];

export function AppSidebar({
  navMain,
  sublocation,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  sublocation: string;
  navMain: NavMain;
}) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-transparent text-sidebar-primary-foreground">
                  <img src={unicornImg} />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">DT Stat Viewer 2</span>
                  <span className="">{sublocation}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* We create a SidebarGroup for each parent. */}
        {navMain.map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.map((item) => (
                  <SidebarMenuItem key={item.title} className="flex items-center">
                    <SidebarMenuButton asChild isActive={item.isActive} onClick={() => item.onClick?.()}>
                      <Link to={item.url}>{item.title}</Link>
                    </SidebarMenuButton>
                    {item.rightItem}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
