import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Artifacts() {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Artifacts</CardTitle>
        <CardDescription>Downloads from the Express vault.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-(--card-spacing)">
        <div>
          <p className="font-mono text-sm">approval_note.docx</p>
          <p className="text-xs text-muted-foreground">
            Written after the inspection beat.
          </p>
        </div>
        <Button variant="outline" disabled>
          <FileDown data-icon="inline-start" />
          Download
        </Button>
      </CardContent>
    </Card>
  );
}
