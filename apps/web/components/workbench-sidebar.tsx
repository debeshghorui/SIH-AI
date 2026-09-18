"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  Files,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Artifacts } from "@/components/artifacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deleteConversation,
  listConversations,
  patchConversation,
  type Conversation,
} from "@/lib/query/conversations";

export type SidebarView = "chat" | "files";

type WorkbenchSidebarProps = {
  collapsed: boolean;
  view: SidebarView;
  conversationId: string | null;
  onViewChange: (view: SidebarView) => void;
  onSelectConversation: (id: string) => void;
  onDeletedConversation: (id: string) => void;
  onNewChat: () => void;
  newChatPending?: boolean;
};

function RailButton({
  collapsed,
  label,
  active,
  onClick,
  children,
}: {
  collapsed: boolean;
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size={collapsed ? "icon-sm" : "sm"}
      className={cn("w-full", !collapsed && "justify-start gap-2")}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {children}
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex w-full">{button}</span>} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ConversationRow({
  item,
  active,
  onSelect,
  onDeleted,
}: {
  item: Conversation;
  active: boolean;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const pin = useMutation({
    mutationFn: () => patchConversation(item.id, { pinned: !item.pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const rename = useMutation({
    mutationFn: (title: string) => patchConversation(item.id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteConversation(item.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["conversations", item.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onDeleted(item.id);
    },
  });

  function startRename() {
    setDraft(item.title);
    setEditing(true);
  }

  function cancelRename() {
    setDraft(item.title);
    setEditing(false);
    rename.reset();
  }

  function commitRename() {
    const next = draft.trim();
    if (!next || next === item.title) {
      cancelRename();
      return;
    }
    rename.mutate(next.slice(0, 80));
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-0.5 rounded-lg bg-muted pr-0.5"
        onSubmit={(event) => {
          event.preventDefault();
          commitRename();
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          maxLength={80}
          aria-label="Chat title"
          aria-invalid={rename.isError}
          disabled={rename.isPending}
          className="h-7 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelRename();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              commitRename();
            }
          }}
          onBlur={() => {
            if (!rename.isPending) commitRename();
          }}
        />
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-0.5 rounded-lg pr-0.5",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm"
        onClick={() => onSelect(item.id)}
        onDoubleClick={(event) => {
          event.preventDefault();
          startRename();
        }}
      >
        {item.title}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Rename ${item.title}`}
        onClick={startRename}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "shrink-0 text-muted-foreground",
          item.pinned
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
        aria-label={item.pinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
        disabled={pin.isPending}
        onClick={() => pin.mutate()}
      >
        {item.pinned ? <PinOff /> : <Pin />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
        aria-label={`Delete ${item.title}`}
        disabled={remove.isPending}
        onClick={() => {
          if (!window.confirm(`Delete "${item.title}" and its messages?`)) {
            return;
          }
          remove.mutate();
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function ConversationSection({
  label,
  items,
  empty,
  conversationId,
  onSelect,
  onDeleted,
}: {
  label: string;
  items: Conversation[];
  empty: string;
  conversationId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <ConversationRow
                item={item}
                active={item.id === conversationId}
                onSelect={onSelect}
                onDeleted={onDeleted}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkbenchSidebar({
  collapsed,
  view,
  conversationId,
  onViewChange,
  onSelectConversation,
  onDeletedConversation,
  onNewChat,
  newChatPending,
}: WorkbenchSidebarProps) {
  const { data, error, isError } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    staleTime: 0,
    retry: 1,
    refetchOnMount: "always",
  });
  const items = data?.items ?? [];
  const pinned = items.filter((c) => c.pinned);
  const recents = items.filter((c) => !c.pinned);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r bg-background transition-[width] duration-200",
        collapsed ? "w-12" : "w-60",
      )}
    >
      <nav className="flex flex-col gap-1 p-2">
        <RailButton
          collapsed={collapsed}
          label="New chat"
          onClick={onNewChat}
        >
          <SquarePen className="size-4" />
        </RailButton>
        <RailButton
          collapsed={collapsed}
          label="Chat"
          active={view === "chat"}
          onClick={() => onViewChange("chat")}
        >
          <MessageSquare className="size-4" />
        </RailButton>
        <RailButton
          collapsed={collapsed}
          label="Files"
          active={view === "files"}
          onClick={() => onViewChange("files")}
        >
          <Files className="size-4" />
        </RailButton>
      </nav>
      <Separator />
      {collapsed ? (
        <div className="flex-1" />
      ) : view === "files" ? (
        <Artifacts />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-1 pb-3">
            {isError ? (
              <p className="px-2 py-1 text-xs text-destructive">
                {error instanceof Error ? error.message : "Could not load chats."}
              </p>
            ) : null}
            {newChatPending ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                Starting a thread…
              </p>
            ) : null}
            <ConversationSection
              label="Pinned"
              items={pinned}
              empty="Pin a chat to keep it here."
              conversationId={conversationId}
              onSelect={onSelectConversation}
              onDeleted={onDeletedConversation}
            />
            <ConversationSection
              label="Chats"
              items={recents}
              empty="Send a message to start a thread."
              conversationId={conversationId}
              onSelect={onSelectConversation}
              onDeleted={onDeletedConversation}
            />
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
