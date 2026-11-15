"use client";

import * as React from "react";
import type { TailscaleSourceDocument } from "@subboost/core/subscription/tailscale-yaml-source";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { TailscaleSourceForm, type TailscaleSourceFormHandle } from "./tailscale-source-form";

export type TailscaleDraftDialogProps = {
  draft: TailscaleSourceDocument | null;
  knownStateDirs: readonly unknown[];
  onApply: (content: string) => void;
  onCancel: () => void;
};

/** Creates a Tailscale node as an ordinary YAML source only when the draft is applied. */
export function TailscaleDraftDialog({ draft, knownStateDirs, onApply, onCancel }: TailscaleDraftDialogProps) {
  // The form decides whether closing needs confirmation, as in the source editor.
  const formRef = React.useRef<TailscaleSourceFormHandle>(null);
  const requestClose = () => {
    if (formRef.current) formRef.current.requestClose();
    else onCancel();
  };

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>添加 Tailscale 节点</DialogTitle>
        </DialogHeader>
        {draft ? (
          <TailscaleSourceForm
            ref={formRef}
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
