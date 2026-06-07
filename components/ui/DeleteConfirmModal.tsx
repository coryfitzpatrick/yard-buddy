"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TriangleAlert } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  deleting?: boolean;
}

export function DeleteConfirmModal({ open, onOpenChange, title, description, onConfirm, deleting }: Props) {
  const [typed, setTyped] = useState("");

  function handleClose(next: boolean) {
    if (!next) setTyped("");
    onOpenChange(next);
  }

  async function handleConfirm() {
    await onConfirm();
    setTyped("");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <TriangleAlert className="w-5 h-5 shrink-0" />
            <DialogTitle className="text-red-600">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-gray-700">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-sm text-gray-500">
            Type <span className="font-mono font-semibold text-gray-800">DELETE</span> to confirm
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            className="font-mono"
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={typed !== "DELETE" || deleting}
            onClick={handleConfirm}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
