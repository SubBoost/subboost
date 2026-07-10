import { Plus, RotateCcw, X } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { cn } from "@subboost/ui/lib/utils";

export function ProxyGroupMemberSectionHeader({
  mode,
  nodeCount,
  proxyGroupCount,
  onNodeAction,
  onProxyGroupAction,
  nodeActionDisabled,
  proxyGroupActionDisabled,
  onRestore,
  restoreDisabled = false,
}: {
  mode: "included" | "excluded";
  nodeCount: number;
  proxyGroupCount: number;
  onNodeAction: () => void;
  onProxyGroupAction: () => void;
  nodeActionDisabled: boolean;
  proxyGroupActionDisabled: boolean;
  onRestore?: () => void;
  restoreDisabled?: boolean;
}) {
  const included = mode === "included";
  const verb = included ? "移除" : "添加";
  const ActionIcon = included ? X : Plus;
  const actionTone = included
    ? "text-white/40 hover:bg-red-500/10 hover:text-red-200"
    : "text-white/40 hover:bg-emerald-500/10 hover:text-emerald-200";

  return (
    <div className="proxy-group-member-toolbar mb-2 flex min-h-6 min-w-0 flex-nowrap items-center gap-1 whitespace-nowrap">
      <div
        className="proxy-group-member-heading shrink-0 text-[11px] font-medium text-white/50"
        title={included ? "已启用成员" : "未启用成员"}
      >
        <span className="proxy-group-member-heading-full">
          {included ? "已启用成员" : "未启用成员"}
        </span>
        <span aria-hidden="true" className="proxy-group-member-heading-compact">
          {included ? "启用" : "未启用"}
        </span>
      </div>
      <div className="proxy-group-member-actions ml-auto flex shrink-0 flex-nowrap items-center gap-0.5">
        {included && onRestore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="proxy-group-member-action-button h-6 min-w-6 shrink-0 gap-0.5 px-1.5 text-[10px] text-white/40 hover:bg-indigo-500/10 hover:text-indigo-200 disabled:pointer-events-none disabled:opacity-30"
            title="恢复默认成员"
            aria-label="恢复默认成员"
            disabled={restoreDisabled}
            onClick={onRestore}
          >
            <RotateCcw className="h-3 w-3 shrink-0" />
            <span className="proxy-group-member-action-full">恢复默认成员</span>
            <span className="proxy-group-member-action-medium">默认</span>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "proxy-group-member-action-button h-6 min-w-6 shrink-0 gap-0.5 px-1.5 text-[10px] disabled:pointer-events-none disabled:opacity-30",
            actionTone,
          )}
          title={`${verb}全部节点`}
          aria-label={`${verb}全部节点`}
          disabled={nodeActionDisabled}
          onClick={onNodeAction}
        >
          <ActionIcon className="h-3 w-3 shrink-0" />
          <span className="proxy-group-member-action-full">{verb}全部节点</span>
          <span className="proxy-group-member-action-medium">{verb}节点</span>
          <span aria-hidden="true" className="proxy-group-member-action-compact">节</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "proxy-group-member-action-button h-6 min-w-6 shrink-0 gap-0.5 px-1.5 text-[10px] disabled:pointer-events-none disabled:opacity-30",
            actionTone,
          )}
          title={`${verb}全部代理组`}
          aria-label={`${verb}全部代理组`}
          disabled={proxyGroupActionDisabled}
          onClick={onProxyGroupAction}
        >
          <ActionIcon className="h-3 w-3 shrink-0" />
          <span className="proxy-group-member-action-full">{verb}全部代理组</span>
          <span className="proxy-group-member-action-medium">{verb}代理组</span>
          <span aria-hidden="true" className="proxy-group-member-action-compact">组</span>
        </Button>
        <Badge
          variant="outline"
          title={`${included ? "已启用" : "未启用"}节点：${nodeCount} 个`}
          className="proxy-group-member-count h-5 shrink-0 whitespace-nowrap border-white/10 bg-white/5 px-1.5 text-[9px] leading-none text-white/45"
        >
          {nodeCount} 节点
        </Badge>
        <Badge
          variant="outline"
          title={`${included ? "已启用" : "未启用"}代理组：${proxyGroupCount} 个，不含 DIRECT 和 REJECT`}
          className="proxy-group-member-count h-5 shrink-0 whitespace-nowrap border-white/10 bg-white/5 px-1.5 text-[9px] leading-none text-white/45"
        >
          {proxyGroupCount} 代理组
        </Badge>
      </div>
    </div>
  );
}
