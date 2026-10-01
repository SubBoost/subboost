import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Badge, badgeVariants } from "./badge";
import { Button, buttonVariants } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Input } from "./input";
import { PagePager } from "./page-pager";

describe("basic UI components", () => {
  it("renders button and badge variants including asChild buttons", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(Button, { variant: "destructive", size: "lg", className: "extra" }, "Delete"),
        React.createElement(Button, { asChild: true, variant: "link" }, React.createElement("a", { href: "/docs" }, "Docs")),
        React.createElement(Badge, { variant: "warning", className: "badge-extra" }, "Warn")
      )
    );

    expect(html).toContain("Delete");
    expect(html).toContain("href=\"/docs\"");
    expect(html).toContain("Warn");
    expect(buttonVariants({ variant: "outline", size: "sm" })).toContain("h-8");
    expect(badgeVariants({ variant: "success" })).toContain("green");
  });

  it("renders card sections and date/text inputs with merged classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Card,
        { className: "card-extra" },
        React.createElement(CardHeader, null, React.createElement(CardTitle, null, "Title"), React.createElement(CardDescription, null, "Desc")),
        React.createElement(CardContent, { className: "content-extra" }, "Body"),
        React.createElement(CardFooter, null, "Footer"),
        React.createElement(Input, { type: "date", value: "2026-06-06", readOnly: true }),
        React.createElement(Input, { type: "text", placeholder: "Name", disabled: true })
      )
    );

    expect(html).toContain("card-extra");
    expect(html).toContain("Title");
    expect(html).toContain("Desc");
    expect(html).toContain("content-extra");
    expect(html).toContain("type=\"date\"");
    expect(html).toContain("[-webkit-text-fill-color:var(--fg)]");
    expect(html).toContain("[color-scheme:var(--date-input-scheme)]");
    expect(html).toContain("placeholder=\"Name\"");
    expect(html).toContain("disabled=\"\"");
  });

  it("clamps PagePager navigation and ignores empty or invalid page input", () => {
    const onPageChange = vi.fn();
    const pager = PagePager({ page: 2, totalPages: 3, onPageChange, className: "pager" }) as React.ReactElement<any>;
    const children = React.Children.toArray(pager.props.children) as React.ReactElement<any>[];
    const previous = children[0];
    const middle = children[1];
    const next = children[2];
    const input = React.Children.toArray(middle.props.children)[0] as React.ReactElement<any>;

    previous.props.onClick();
    next.props.onClick();
    input.props.onChange({ target: { value: "" } });
    input.props.onChange({ target: { value: "bad" } });
    input.props.onChange({ target: { value: "99" } });

    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(onPageChange).toHaveBeenCalledTimes(3);

    const single = PagePager({ page: 1, totalPages: 0, onPageChange, disabled: true }) as React.ReactElement<any>;
    const singleChildren = React.Children.toArray(single.props.children) as React.ReactElement<any>[];
    expect(singleChildren[0].props.disabled).toBe(true);
    expect(singleChildren[2].props.disabled).toBe(true);
  });
});
