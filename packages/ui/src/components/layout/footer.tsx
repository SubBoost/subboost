"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { useUserStore } from "@subboost/ui/store/user-store";
import { SUBBOOST_FOOTER_DESCRIPTION } from "@subboost/ui/brand";

export type FooterMode = "default" | "local";

export type FooterLink = {
  href: string;
  label: string;
  external?: boolean;
  icon?: "github";
  iconSrc?: string;
  title?: string;
  authOnly?: boolean;
  disabled?: boolean;
};

type FooterProps = {
  mode?: FooterMode;
  buildVersion?: string | null;
  brandLinks?: FooterLink[];
  helpLinks?: FooterLink[];
  resourceLinks?: FooterLink[];
};

const sourceRepositoryUrl = "https://github.com/SubBoost/subboost";

const defaultBrandLinks: FooterLink[] = [
  {
    href: sourceRepositoryUrl,
    label: "开源仓库",
    title: "开源仓库",
    external: true,
    icon: "github",
  },
  {
    href: "https://ryanvan.com/",
    label: "RyanVan's Blog",
    title: "RyanVan's Blog",
    external: true,
    iconSrc: "/icons/ryanvan-blog.png",
  },
  {
    href: "https://linux.do",
    label: "Linux DO",
    title: "Linux DO",
    external: true,
    iconSrc: "/icons/linuxdo.png",
  },
];

const defaultResourceLinks: FooterLink[] = [
  { href: "https://github.com/MetaCubeX/mihomo", label: "Mihomo Core", external: true },
  { href: "https://github.com/MetaCubeX/meta-rules-dat", label: "规则库", external: true },
  { href: "https://www.haitunt.org/", label: "代理百科", external: true },
];

function filterLinks(links: FooterLink[], hasUser: boolean): FooterLink[] {
  return links.filter((link) => !link.authOnly || hasUser);
}

function FooterTextLink({ link }: { link: FooterLink }) {
  if (link.disabled) {
    return (
      <span title={link.title} className="text-sm text-fg-35">
        {link.label}
      </span>
    );
  }

  const className = "text-sm text-fg-50 hover:text-fg transition-colors";
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={`${className} inline-flex items-center gap-1`}>
        {link.label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

function FooterBrandIcon({ link }: { link: FooterLink }) {
  if (link.icon === "github") {
    return (
      <svg
        aria-hidden="true"
        className="h-6 w-6 fill-current text-fg-65 transition-colors group-hover:text-fg"
        data-brand-icon="github"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path d="M12 .5C5.65 .5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18A10.93 10.93 0 0 1 12 5.54c.98 0 1.97.13 2.89.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
      </svg>
    );
  }

  if (link.iconSrc) {
    return (
      <Image
        src={link.iconSrc}
        alt={link.label}
        width={24}
        height={24}
        className="rounded-sm"
      />
    );
  }

  return <ExternalLink className="h-5 w-5 text-fg-50" />;
}

function buildDefaultHelpLinks(mode: FooterMode): FooterLink[] {
  if (mode === "local") {
    return [
      { href: sourceRepositoryUrl, label: "开源仓库", external: true },
      { href: "https://ryanvan.com/t/topic/59?u=ryan", label: "配置教程", external: true },
      { href: "https://subboost.org/faq", label: "常见问题", external: true },
    ];
  }
  return [
    { href: sourceRepositoryUrl, label: "开源仓库", external: true },
    { href: "https://ryanvan.com/t/topic/59?u=ryan", label: "配置教程", external: true },
    { href: "https://subboost.org/terms", label: "服务条款", external: true },
  ];
}

export function Footer({
  mode = "default",
  buildVersion,
  brandLinks = defaultBrandLinks,
  helpLinks,
  resourceLinks = defaultResourceLinks,
}: FooterProps) {
  const { user } = useUserStore();
  const hasUser = Boolean(user);
  const visibleFeatureLinks = filterLinks(
    [
      { href: "/", label: "配置生成器" },
      { href: "/templates", label: "模板库" },
      { href: "/dashboard", label: "我的订阅", authOnly: true },
    ],
    hasUser
  );
  const visibleHelpLinks = filterLinks(helpLinks ?? buildDefaultHelpLinks(mode), hasUser);
  const visibleResourceLinks = filterLinks(resourceLinks, hasUser);

  return (
    <footer className="hidden md:block border-t border-ink/10 bg-dark-50/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="SubBoost"
                width={32}
                height={32}
                className="rounded-xl shadow-lg shadow-blue-500/25"
              />
              <span className="font-semibold text-fg">SubBoost</span>
            </div>
            <p className="text-sm leading-relaxed text-fg-50">{SUBBOOST_FOOTER_DESCRIPTION}</p>
            {brandLinks.length > 0 && (
              <div className="flex items-center gap-4">
                {brandLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group hover:opacity-80 transition-opacity"
                    title={link.title || link.label}
                    aria-label={link.title || link.label}
                  >
                    <FooterBrandIcon link={link} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-4 font-medium text-fg">功能</h3>
            <ul className="space-y-2">
              {visibleFeatureLinks.map((link) => (
                <li key={link.href}>
                  <FooterTextLink link={link} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-medium text-fg">帮助</h3>
            <ul className="space-y-2">
              {visibleHelpLinks.map((link) => (
                <li key={`${link.label}-${link.href}`}>
                  <FooterTextLink link={link} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-medium text-fg">相关资源</h3>
            <ul className="space-y-2">
              {visibleResourceLinks.map((link) => (
                <li key={link.href}>
                  <FooterTextLink link={link} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-ink/5 pt-6">
          <p className="text-center text-xs text-fg-40">
            Powered by SubBoost{buildVersion ? ` | v ${buildVersion}` : ""}
          </p>
        </div>
      </div>
    </footer>
  );
}
