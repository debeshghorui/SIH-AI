import { Artifacts } from "@/components/artifacts";
import { Chat } from "@/components/chat";
import { Meter } from "@/components/meter";
import { Trace } from "@/components/trace";

export function Workbench() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            SIH 26117 · MRPL
          </p>
          <h1 className="text-lg font-medium">Sovereign workbench</h1>
        </div>
        <Meter />
      </header>
      <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
        <Chat />
        <aside className="flex min-h-0 flex-col gap-4 overflow-auto">
          <div className="min-h-0 flex-1">
            <Trace />
          </div>
          <Artifacts />
        </aside>
      </main>
    </div>
  );
}
