"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Chat } from "@/components/chat";
import { Meter } from "@/components/meter";
import { Trace } from "@/components/trace";
import {
  WorkbenchSidebar,
  type SidebarView,
} from "@/components/workbench-sidebar";
import { Button } from "@/components/ui/button";
import { createConversation } from "@/lib/query/conversations";

const COLLAPSED_KEY = "workbench.sidebar.collapsed";
const MD = "(min-width: 768px)";

export function Workbench() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<SidebarView>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [virgin, setVirgin] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(COLLAPSED_KEY) === "1") {
      setCollapsed(true);
    }
    const mq = window.matchMedia(MD);
    const onMq = () => {
      if (mq.matches) setMobileOpen(false);
    };
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  function isDesktop() {
    return window.matchMedia(MD).matches;
  }

  function toggleRail() {
    if (isDesktop()) {
      setCollapsed((current) => {
        const next = !current;
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
        return next;
      });
      return;
    }
    setMobileOpen((open) => !open);
  }

  const newChat = useMutation({
    mutationFn: createConversation,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setConversationId(created.id);
      setVirgin(true);
      setView("chat");
    },
  });

  function onNewChat() {
    setView("chat");
    setMobileOpen(false);
    if (virgin && conversationId) return;
    newChat.mutate();
  }

  function onSelectConversation(id: string) {
    setConversationId(id);
    setVirgin(false);
    setView("chat");
    setMobileOpen(false);
  }

  function onViewChange(next: SidebarView) {
    setView(next);
    if (isDesktop() && collapsed) {
      setCollapsed(false);
      window.localStorage.setItem(COLLAPSED_KEY, "0");
    }
    if (!isDesktop()) setMobileOpen(true);
  }

  const railCollapsed = collapsed && !mobileOpen;

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-4 border-b px-3 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!railCollapsed}
            onClick={toggleRail}
          >
            {railCollapsed ? <PanelLeft /> : <PanelLeftClose />}
          </Button>
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="font-heading text-lg font-medium">
              Sovereign workbench
            </h1>
            <p className="hidden text-xs tracking-wide text-muted-foreground uppercase sm:block">
              SIH 26117 · MRPL
            </p>
          </div>
        </div>
        <Meter />
      </header>
      <div className="relative flex min-h-0 flex-1">
        {mobileOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-30 bg-background/70 md:hidden"
            aria-label="Close sidebar"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
        <div
          className={
            mobileOpen
              ? "absolute inset-y-0 left-0 z-40 h-full md:static md:z-0"
              : "hidden h-full md:block"
          }
        >
          <WorkbenchSidebar
            collapsed={railCollapsed}
            view={view}
            conversationId={conversationId}
            onViewChange={onViewChange}
            onSelectConversation={onSelectConversation}
            onDeletedConversation={(id) => {
              if (conversationId === id) {
                setConversationId(null);
                setVirgin(false);
              }
            }}
            onNewChat={onNewChat}
            newChatPending={newChat.isPending}
          />
        </div>
        <main className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
          <Chat
            conversationId={conversationId}
            onConversationBound={(id) => {
              setConversationId(id);
              setVirgin(false);
            }}
          />
          <aside className="flex min-h-0 flex-col overflow-y-auto">
            <Trace />
          </aside>
        </main>
      </div>
    </div>
  );
}
