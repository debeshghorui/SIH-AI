"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderCode,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import { Chat } from "@/components/chat";
import { Meter } from "@/components/meter";
import { Studio } from "@/components/studio";
import { Trace } from "@/components/trace";
import {
  WorkbenchSidebar,
  type SidebarView,
} from "@/components/workbench-sidebar";
import { Button } from "@/components/ui/button";
import { createConversation } from "@/lib/query/conversations";
import { useProjectTree } from "@/lib/query/project";

const COLLAPSED_KEY = "workbench.sidebar.collapsed";
const TRACE_KEY = "workbench.trace.collapsed";
const MD = "(min-width: 768px)";

export function Workbench() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [traceCollapsed, setTraceCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<SidebarView>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [virgin, setVirgin] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "studio">("chat");
  const [studioOpen, setStudioOpen] = useState(false);
  const userHidStudio = useRef(false);
  const prevConversationId = useRef<string | null>(null);
  const { data: projectFiles } = useProjectTree(conversationId);

  useEffect(() => {
    if (window.localStorage.getItem(COLLAPSED_KEY) === "1") {
      setCollapsed(true);
    }
    if (window.localStorage.getItem(TRACE_KEY) === "1") {
      setTraceCollapsed(true);
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

  function toggleTrace() {
    setTraceCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(TRACE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function openStudio() {
    userHidStudio.current = false;
    setStudioOpen(true);
  }

  function toggleStudio() {
    setStudioOpen((open) => {
      const next = !open;
      userHidStudio.current = open;
      return next;
    });
    setMobilePane((pane) => (studioOpen ? "chat" : pane));
  }

  useEffect(() => {
    const prev = prevConversationId.current;
    prevConversationId.current = conversationId;
    if (prev && prev !== conversationId) {
      userHidStudio.current = false;
      setStudioOpen(false);
      setMobilePane("chat");
    }
  }, [conversationId]);

  useEffect(() => {
    if (userHidStudio.current) return;
    if (projectFiles && projectFiles.length > 0) setStudioOpen(true);
  }, [projectFiles]);

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
    <div className="workbench-surface flex h-svh flex-col overflow-hidden bg-background">
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-3 py-2.5 backdrop-blur-md supports-[padding:max(0px)]:pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-4 md:px-5"
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!railCollapsed}
            onClick={toggleRail}
          >
            {railCollapsed ? <PanelLeft /> : <PanelLeftClose />}
          </Button>
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/50 text-foreground"
              aria-hidden
            >
              <span className="font-mono text-[0.6rem] font-semibold tracking-widest">
                MR
              </span>
            </div>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-[1.0625rem]">
                MRPL Workbench
              </h1>
              <p className="truncate text-[0.6875rem] text-muted-foreground sm:text-xs">
                On-prem agent · SIH 26117
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className={
              studioOpen
                ? "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-muted px-2.5 text-[0.8rem] font-medium text-foreground"
                : "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }
            aria-pressed={studioOpen}
            onClick={toggleStudio}
          >
            <FolderCode className="size-3.5" />
            Project
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={
              traceCollapsed ? "Show agent trace" : "Hide agent trace"
            }
            aria-expanded={!traceCollapsed}
            onClick={toggleTrace}
          >
            {traceCollapsed ? <PanelRight /> : <PanelRightClose />}
          </Button>
          <Meter />
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1">
        {mobileOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-30 bg-background/75 backdrop-blur-[2px] md:hidden"
            aria-label="Close sidebar"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
        <div
          className={
            mobileOpen
              ? "absolute inset-y-0 left-0 z-40 h-full shadow-xl md:static md:z-0 md:shadow-none"
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
        <main
          className={
            studioOpen
              ? traceCollapsed
                ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-2 sm:gap-4 sm:p-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(18rem,1.05fr)]"
                : "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-2 sm:gap-4 sm:p-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(18rem,1.05fr)] md:grid-rows-[minmax(0,1fr)_minmax(12rem,0.35fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.1fr)_minmax(16rem,0.8fr)] xl:grid-rows-none"
              : traceCollapsed
                ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-2 sm:gap-4 sm:p-4"
                : "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-2 sm:gap-4 sm:p-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)] lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)] xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]"
          }
        >
          {studioOpen ? (
            <div className="flex shrink-0 gap-1 md:hidden">
              <Button
                type="button"
                variant={mobilePane === "chat" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMobilePane("chat")}
              >
                Chat
              </Button>
              <Button
                type="button"
                variant={mobilePane === "studio" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMobilePane("studio")}
              >
                Project
              </Button>
            </div>
          ) : null}
          <div
            className={
              !studioOpen || mobilePane === "chat"
                ? "flex min-h-0 min-w-0 flex-1 flex-col md:min-h-0"
                : "hidden min-h-0 md:flex md:flex-col"
            }
          >
            <Chat
              conversationId={conversationId}
              onConversationBound={(id) => {
                setConversationId(id);
                setVirgin(false);
              }}
              onCodingPrompt={openStudio}
            />
          </div>
          {studioOpen ? (
            <div
              className={
                mobilePane === "studio"
                  ? "flex min-h-0 min-w-0 flex-1 flex-col md:min-h-0"
                  : "hidden min-h-0 md:flex md:flex-col"
              }
            >
              <Studio conversationId={conversationId} />
            </div>
          ) : null}
          <aside
            className={
              traceCollapsed
                ? "hidden"
                : studioOpen
                  ? "flex min-h-0 flex-col overflow-hidden max-md:hidden md:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1"
                  : "flex min-h-0 flex-col overflow-hidden max-md:min-h-[14rem]"
            }
          >
            <Trace onCollapse={toggleTrace} />
          </aside>
        </main>
      </div>
    </div>
  );
}
