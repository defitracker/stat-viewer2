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

type NavItem = {
  title: string;
  url: string;
  onClick?: () => void;
  rightItem?: React.ReactNode;
  isActive?: boolean;
  isToggle?: boolean;
  isChecked?: boolean;
  onToggle?: (checked: boolean) => void;
};

type NavMain = {
  title: string;
  url: string;
  titleAction?: React.ReactNode;
  items: NavItem[];
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
            <SidebarGroupLabel className="flex items-center justify-between">
              {item.title}
              {item.titleAction}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.map((navItem) => (
                  <SidebarMenuItem key={navItem.title} className="flex items-center">
                    {navItem.isToggle ? (
                      <label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer w-full">
                        <input
                          type="checkbox"
                          checked={navItem.isChecked}
                          onChange={(e) => navItem.onToggle?.(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        {navItem.title}
                      </label>
                    ) : (
                      <>
                        <SidebarMenuButton asChild isActive={navItem.isActive} onClick={() => navItem.onClick?.()}>
                          <Link to={navItem.url}>{navItem.title}</Link>
                        </SidebarMenuButton>
                        {navItem.rightItem}
                      </>
                    )}
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
