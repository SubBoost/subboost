import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-popover", () => ({
  Arrow: () => React.createElement("span", null, "arrow"),
  Content: ({ children, sideOffset: _sideOffset, ...props }: any) => React.createElement("div", props, children),
  Portal: (props: any) => React.createElement("div", null, props.children),
  Root: (props: any) => React.createElement("div", null, props.children),
  Trigger: (props: any) => React.createElement("div", null, props.children),
}));
vi.mock("lucide-react", () => ({
  AlertCircle: () => React.createElement("span", null, "alert-icon"),
  HelpCircle: () => React.createElement("span", null, "help-icon"),
}));

import { CnIpNoResolveHelpButton, ExperimentalCnRuleHelpButton } from "./proxy-groups-module-rules-help";

describe("proxy group module rule help buttons", () => {
  it("renders the experimental CN rule explanation", () => {
    const html = renderToStaticMarkup(React.createElement(ExperimentalCnRuleHelpButton));

    expect(html).toContain("国内服务实验性选项说明");
    expect(html).toContain("实验性：启用后置geosite/cn.mrs规则");
    expect(html).toContain("🌍 非中国");
    expect(html).toContain("help-icon");
  });

  it("renders the cn-ip no-resolve explanation", () => {
    const html = renderToStaticMarkup(React.createElement(CnIpNoResolveHelpButton));

    expect(html).toContain("国内服务 no-resolve 说明");
    expect(html).toContain("RULE-SET,cn-ip,🔒 国内服务,no-resolve");
    expect(html).toContain("DNS泄露");
    expect(html).toContain("alert-icon");
  });
});
