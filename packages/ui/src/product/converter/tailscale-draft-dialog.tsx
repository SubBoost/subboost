"use client";

import type { TailscaleSourceDocument } from "@subboost/core/subscription/tailscale-yaml-source";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { TailscaleSourceForm } from "./tailscale-source-form";

export type TailscaleDraftDialogProps = {
  draft: TailscaleSourceDocument | null;
  knownStateDirs: readonly unknown[];
  onApply: (content: string) => void;
  onCancel: () => void;
};

/** Creates a Tailscale node as an ordinary YAML source only when the draft is applied. */
export function TailscaleDraftDialog({ draft, knownStateDirs, onApply, onCancel }: TailscaleDraftDialogProps) {
  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>添加 Tailscale 节点</DialogTitle>
        </DialogHeader>
        {draft ? (
          <TailscaleSourceForm
            document={draft}
            knownStateDirs={knownStateDirs}
            applyLabel="添加并导入"
            onApply={onApply}
            onCancel={onCancel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
