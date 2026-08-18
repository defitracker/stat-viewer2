import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link2, Plus, X } from "lucide-react";
import { useExplorerStore } from "@/util/explorerStore";

export default function ExplorerSettings() {
  const { explorers, setExplorers, resetExplorers } = useExplorerStore();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<[string, string][]>([]);

  const onOpenChange = (next: boolean) => {
    if (next) setRows(Object.entries(explorers));
    setOpen(next);
  };

  const editRow = (i: number, network: string, url: string) =>
    setRows(rows.map((r, j) => (j === i ? [network, url] : r)));

  const save = () => {
    const next: Record<string, string> = {};
    for (const [network, url] of rows) {
      const name = network.trim();
      if (name) next[name] = url.trim().replace(/\/+$/, "");
    }
    setExplorers(next);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Explorer URLs">
          <Link2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Explorer URLs</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
          {rows.map(([network, url], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="w-44"
                placeholder="Network"
                value={network}
                onChange={(e) => editRow(i, e.target.value, url)}
              />
              <Input
                placeholder="https://etherscan.io"
                value={url}
                onChange={(e) => editRow(i, network, e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Remove"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No networks. Unknown networks fall back to blockscan.com.
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => setRows([...rows, ["", ""]])}>
            <Plus className="mr-1 h-4 w-4" /> Add network
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                resetExplorers();
                setOpen(false);
              }}
            >
              Reset to defaults
            </Button>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
