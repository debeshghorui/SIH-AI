import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const FIELDS = [
  { key: "store", hint: "sql · vector · files · none" },
  { key: "model", hint: "nano · chat · coder · vision" },
  { key: "tools", hint: "fs · ocr · sandbox · docx · search" },
  { key: "reason", hint: "one sentence from the router" },
] as const;

export function Trace() {
  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle>Agent trace</CardTitle>
        <CardDescription>
          Router outputs stay visible. No run yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-(--card-spacing)">
        {FIELDS.map((field, i) => (
          <div key={field.key}>
            {i > 0 ? <Separator className="mb-3" /> : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {field.key}
              </span>
              <Badge variant="outline">—</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
