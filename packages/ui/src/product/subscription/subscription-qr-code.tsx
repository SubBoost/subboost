"use client";

import * as React from "react";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@subboost/ui/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";

export function SubscriptionQrCode({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <QRCodeSVG value={url} size={240} marginSize={4} level="M" title="订阅链接二维码"
        className="h-auto max-w-full rounded-lg bg-white" />
      <p className="text-center text-xs text-white/60">使用其他设备的代理客户端扫码导入订阅</p>
    </div>
  );
}

export function SubscriptionQrButton({ url }: { url: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="gap-0 sm:gap-2" title="显示订阅二维码"
        aria-label="显示订阅二维码" disabled={!url} onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4" /><span className="hidden sm:inline">二维码</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>订阅二维码</DialogTitle>
            <DialogDescription>扫码导入当前订阅链接</DialogDescription>
          </DialogHeader>
          <SubscriptionQrCode url={url} />
        </DialogContent>
      </Dialog>
    </>
  );
}
