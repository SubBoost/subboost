import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-popover", () => ({
  Anchor: (props: any) => React.createElement("span", null, props.children),
  Close: (props: any) => React.createElement("button", null, props.children),
  Root: (props: any) => React.createElement("div", null, props.children),
  Trigger: (props: any) => React.createElement("span", null, props.children),
  Portal: (props: any) => React.createElement("div", null, props.children),
  Content: ({ children, sideOffset: _sideOffset, ...props }: any) => React.createElement("div", props, children),
  Arrow: (props: any) => React.createElement("span", props),
}));

vi.mock("lucide-react", () => ({
  CircleHelp: () => React.createElement("span", null, "circle-help-icon"),
  HelpCircle: () => React.createElement("span", null, "help-icon"),
}));

import { SmartNodeMatchingHelp } from "./smart-node-matching-help";

describe("SmartNodeMatchingHelp", () => {
  it("renders the enabled and disabled descriptions", () => {
    const enabled = renderToStaticMarkup(React.createElement(SmartNodeMatchingHelp, { enabled: true }));
    const disabled = renderToStaticMarkup(React.createElement(SmartNodeMatchingHelp, { enabled: false }));

    expect(enabled).toContain("更新时智能匹配节点说明");
    expect(enabled).toContain("尽量保留你的节点顺序");
    expect(disabled).toContain("只按原始节点名判断");
    expect(disabled).toContain("智能匹配可减少订阅换地址后配置丢失");
  });
});
