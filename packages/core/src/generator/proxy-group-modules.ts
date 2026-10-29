/**
 * 分流代理组预设（静态定义）
 *
 * 从 `proxy-groups.ts` 中拆分出来以降低单文件长度。
 *
 * 注意：该文件只包含静态数据与类型定义。
 */

/**
 * 分流代理组规则
 */
import type { ProxyGroupGroupType } from "@subboost/core/types/config";

export interface ProxyGroupRule {
  id: string;
  name: string;
  behavior: "domain" | "ipcidr" | "classical";
  path: string;
  noResolve?: boolean;
}

/**
 * 分流代理组配置
 */
export interface ProxyGroupModule {
  id: string;
  name: string;
  emoji: string;
  category: "core" | "service" | "media" | "social" | "game" | "tech" | "finance" | "other";
  description: string;
  groupType: ProxyGroupGroupType;
  rules: ProxyGroupRule[];
}
export const PROXY_GROUP_MODULES: ProxyGroupModule[] = [
  // ==================== 核心组 ====================
  {
    id: "select",
    name: "🚀 节点选择",
    emoji: "🚀",
    category: "core",
    description: "手动选择代理节点",
    groupType: "select",
    rules: [],
  },
  {
    id: "auto",
    name: "⚡ 自动选择",
    emoji: "⚡",
    category: "core",
    description: "自动选择最快节点",
    groupType: "url-test",
    rules: [],
  },
  {
    id: "ad",
    name: "🛑 广告拦截",
    emoji: "🛑",
    category: "core",
    description: "拦截广告和追踪器",
    groupType: "reject-first",
    rules: [
      { id: "category-ads-all", name: "广告域名", behavior: "domain", path: "geosite/category-ads-all.mrs" },
    ],
  },
  {
    id: "private",
    name: "🏠 私有网络",
    emoji: "🏠",
    category: "core",
    description: "局域网和私有IP直连",
    groupType: "direct-first",
    rules: [
      { id: "private", name: "私有网络", behavior: "domain", path: "geosite/private.mrs" },
      { id: "private-ip", name: "私有IP", behavior: "ipcidr", path: "geoip/private.mrs", noResolve: true },
    ],
  },
  {
    id: "cn",
    name: "🔒 国内服务",
    emoji: "🔒",
    category: "core",
    description: "国内网站和服务直连",
    groupType: "direct-first",
    rules: [
      { id: "geolocation-cn", name: "国内域名 (精简)", behavior: "domain", path: "geosite/geolocation-cn.mrs" },
      { id: "cn-ip", name: "国内IP", behavior: "ipcidr", path: "geoip/cn.mrs", noResolve: true },
    ],
  },
  {
    id: "global",
    name: "🌍 非中国",
    emoji: "🌍",
    category: "core",
    description: "非中国域名走代理",
    groupType: "select",
    rules: [
      { id: "geolocation-!cn", name: "非中国域名", behavior: "domain", path: "geosite/geolocation-!cn.mrs" },
    ],
  },
  {
    id: "final",
    name: "🐟 漏网之鱼",
    emoji: "🐟",
    category: "core",
    description: "未匹配到任何规则的流量",
    groupType: "select",
    rules: [],
  },

  // ==================== 常用服务 ====================
  {
    id: "ai",
    name: "🤖 AI 服务",
    emoji: "🤖",
    category: "service",
    description: "ChatGPT、Claude、Copilot 等",
    groupType: "select",
    rules: [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
      { id: "anthropic", name: "Anthropic (Claude)", behavior: "domain", path: "geosite/anthropic.mrs" },
      { id: "category-ai-chat-!cn", name: "AI服务合集", behavior: "domain", path: "geosite/category-ai-chat-!cn.mrs" },
    ],
  },
  {
    id: "gemini",
    name: "✨ Gemini",
    emoji: "✨",
    category: "service",
    description: "Google Gemini (Bard) 等",
    groupType: "select",
    rules: [{ id: "google-gemini", name: "Google Gemini", behavior: "domain", path: "geosite/google-gemini.mrs" }],
  },
  {
    id: "youtube",
    name: "📹 油管视频",
    emoji: "📹",
    category: "service",
    description: "YouTube 视频、YouTube Music",
    groupType: "select",
    rules: [
      { id: "youtube", name: "YouTube", behavior: "domain", path: "geosite/youtube.mrs" },
    ],
  },
  {
    id: "google",
    name: "🔍 谷歌服务",
    emoji: "🔍",
    category: "service",
    description: "Google 搜索、Gmail、Drive",
    groupType: "select",
    rules: [
      { id: "google", name: "Google", behavior: "domain", path: "geosite/google.mrs" },
      { id: "google-ip", name: "Google IP", behavior: "ipcidr", path: "geoip/google.mrs", noResolve: true },
    ],
  },
  {
    id: "microsoft",
    name: "Ⓜ️ 微软服务",
    emoji: "Ⓜ️",
    category: "service",
    description: "Microsoft 365、OneDrive、Bing",
    groupType: "select",
    rules: [
      { id: "microsoft", name: "Microsoft", behavior: "domain", path: "geosite/microsoft.mrs" },
      { id: "onedrive", name: "OneDrive", behavior: "domain", path: "geosite/onedrive.mrs" },
    ],
  },
  {
    id: "apple",
    name: "🍏 苹果服务",
    emoji: "🍏",
    category: "service",
    description: "iCloud、App Store",
    groupType: "select",
    rules: [
      { id: "apple", name: "Apple", behavior: "domain", path: "geosite/apple.mrs" },
      { id: "icloud", name: "iCloud", behavior: "domain", path: "geosite/icloud.mrs" },
    ],
  },

  // ==================== 社交通讯 ====================
  {
    id: "telegram",
    name: "📲 电报消息",
    emoji: "📲",
    category: "social",
    description: "Telegram 消息和通话",
    groupType: "select",
    rules: [
      { id: "telegram", name: "Telegram", behavior: "domain", path: "geosite/telegram.mrs" },
      { id: "telegram-ip", name: "Telegram IP", behavior: "ipcidr", path: "geoip/telegram.mrs", noResolve: true },
    ],
  },
  {
    id: "twitter",
    name: "🐦 推特/X",
    emoji: "🐦",
    category: "social",
    description: "Twitter/X 社交平台",
    groupType: "select",
    rules: [
      { id: "twitter", name: "Twitter/X", behavior: "domain", path: "geosite/twitter.mrs" },
      { id: "twitter-ip", name: "Twitter IP", behavior: "ipcidr", path: "geoip/twitter.mrs", noResolve: true },
    ],
  },
  {
    id: "meta",
    name: "📘 Meta 系",
    emoji: "📘",
    category: "social",
    description: "Facebook、Instagram",
    groupType: "select",
    rules: [
      { id: "facebook", name: "Facebook", behavior: "domain", path: "geosite/facebook.mrs" },
      { id: "instagram", name: "Instagram", behavior: "domain", path: "geosite/instagram.mrs" },
      { id: "whatsapp", name: "WhatsApp", behavior: "domain", path: "geosite/whatsapp.mrs" },
      { id: "facebook-ip", name: "Facebook IP", behavior: "ipcidr", path: "geoip/facebook.mrs", noResolve: true },
    ],
  },
  {
    id: "discord",
    name: "🎙️ Discord",
    emoji: "🎙️",
    category: "social",
    description: "Discord 语音聊天",
    groupType: "select",
    rules: [
      { id: "discord", name: "Discord", behavior: "domain", path: "geosite/discord.mrs" },
    ],
  },
  {
    id: "social-other",
    name: "💬 其他社交",
    emoji: "💬",
    category: "social",
    description: "TikTok、Line、Reddit",
    groupType: "select",
    rules: [
      { id: "tiktok", name: "TikTok", behavior: "domain", path: "geosite/tiktok.mrs" },
      { id: "line", name: "Line", behavior: "domain", path: "geosite/line.mrs" },
      { id: "reddit", name: "Reddit", behavior: "domain", path: "geosite/reddit.mrs" },
      { id: "linkedin", name: "LinkedIn", behavior: "domain", path: "geosite/linkedin.mrs" },
      { id: "snap", name: "Snapchat", behavior: "domain", path: "geosite/snap.mrs" },
      { id: "pinterest", name: "Pinterest", behavior: "domain", path: "geosite/pinterest.mrs" },
      { id: "tumblr", name: "Tumblr", behavior: "domain", path: "geosite/tumblr.mrs" },
    ],
  },

  // ==================== 流媒体 ====================
  {
    id: "netflix",
    name: "🎬 奈飞",
    emoji: "🎬",
    category: "media",
    description: "Netflix 视频",
    groupType: "select",
    rules: [
      { id: "netflix", name: "Netflix", behavior: "domain", path: "geosite/netflix.mrs" },
      { id: "netflix-ip", name: "Netflix IP", behavior: "ipcidr", path: "geoip/netflix.mrs", noResolve: true },
    ],
  },
  {
    id: "disney",
    name: "🏰 迪士尼+",
    emoji: "🏰",
    category: "media",
    description: "Disney+ 视频",
    groupType: "select",
    rules: [
      { id: "disney", name: "Disney+", behavior: "domain", path: "geosite/disney.mrs" },
    ],
  },
  {
    id: "streaming-west",
    name: "📺 欧美流媒体",
    emoji: "📺",
    category: "media",
    description: "HBO、Hulu、Prime Video",
    groupType: "select",
    rules: [
      { id: "hbo", name: "HBO", behavior: "domain", path: "geosite/hbo.mrs" },
      { id: "hulu", name: "Hulu", behavior: "domain", path: "geosite/hulu.mrs" },
      { id: "primevideo", name: "Prime Video", behavior: "domain", path: "geosite/primevideo.mrs" },
      { id: "apple-tvplus", name: "Apple TV+", behavior: "domain", path: "geosite/apple-tvplus.mrs" },
      { id: "spotify", name: "Spotify", behavior: "domain", path: "geosite/spotify.mrs" },
      { id: "twitch", name: "Twitch", behavior: "domain", path: "geosite/twitch.mrs" },
      { id: "dazn", name: "DAZN", behavior: "domain", path: "geosite/dazn.mrs" },
    ],
  },
  {
    id: "streaming-asia",
    name: "🎌 亚洲流媒体",
    emoji: "🎌",
    category: "media",
    description: "巴哈姆特、Abema、Viu、KKTV 等",
    groupType: "select",
    rules: [
      { id: "bahamut", name: "巴哈姆特", behavior: "domain", path: "geosite/bahamut.mrs" },
      { id: "biliintl", name: "哔哩哔哩国际版", behavior: "domain", path: "geosite/biliintl.mrs" },
      { id: "niconico", name: "Niconico", behavior: "domain", path: "geosite/niconico.mrs" },
      { id: "abema", name: "Abema", behavior: "domain", path: "geosite/abema.mrs" },
      { id: "viu", name: "Viu", behavior: "domain", path: "geosite/viu.mrs" },
      { id: "kktv", name: "KKTV", behavior: "domain", path: "geosite/kktv.mrs" },
    ],
  },

  // ==================== 游戏平台 ====================
  {
    id: "steam",
    name: "🎮 Steam",
    emoji: "🎮",
    category: "game",
    description: "Steam 游戏平台",
    groupType: "select",
    rules: [
      { id: "steam", name: "Steam", behavior: "domain", path: "geosite/steam.mrs" },
    ],
  },
  {
    id: "gaming-pc",
    name: "🖥️ PC 游戏",
    emoji: "🖥️",
    category: "game",
    description: "Epic、EA、Ubisoft、GOG",
    groupType: "select",
    rules: [
      { id: "epicgames", name: "Epic Games", behavior: "domain", path: "geosite/epicgames.mrs" },
      { id: "ea", name: "EA", behavior: "domain", path: "geosite/ea.mrs" },
      { id: "ubisoft", name: "Ubisoft", behavior: "domain", path: "geosite/ubisoft.mrs" },
      { id: "blizzard", name: "Blizzard", behavior: "domain", path: "geosite/blizzard.mrs" },
      { id: "gog", name: "GOG", behavior: "domain", path: "geosite/gog.mrs" },
      { id: "riot", name: "Riot Games", behavior: "domain", path: "geosite/riot.mrs" },
    ],
  },
  {
    id: "gaming-console",
    name: "🎯 主机游戏",
    emoji: "🎯",
    category: "game",
    description: "PlayStation、Xbox",
    groupType: "select",
    rules: [
      { id: "playstation", name: "PlayStation", behavior: "domain", path: "geosite/playstation.mrs" },
      { id: "xbox", name: "Xbox", behavior: "domain", path: "geosite/xbox.mrs" },
      { id: "nintendo", name: "Nintendo", behavior: "domain", path: "geosite/nintendo.mrs" },
    ],
  },

  // ==================== 技术服务 ====================
  {
    id: "github",
    name: "🐱 代码托管",
    emoji: "🐱",
    category: "tech",
    description: "GitHub、GitLab、Bitbucket",
    groupType: "select",
    rules: [
      { id: "github", name: "GitHub", behavior: "domain", path: "geosite/github.mrs" },
      { id: "gitlab", name: "GitLab", behavior: "domain", path: "geosite/gitlab.mrs" },
      { id: "atlassian", name: "Atlassian / Bitbucket", behavior: "domain", path: "geosite/atlassian.mrs" },
    ],
  },
  {
    id: "cloud",
    name: "☁️ 云服务",
    emoji: "☁️",
    category: "tech",
    description: "AWS、Azure、Cloudflare 等",
    groupType: "select",
    rules: [
      { id: "aws", name: "AWS", behavior: "domain", path: "geosite/aws.mrs" },
      { id: "azure", name: "Azure", behavior: "domain", path: "geosite/azure.mrs" },
      { id: "cloudflare", name: "Cloudflare", behavior: "domain", path: "geosite/cloudflare.mrs" },
      { id: "digitalocean", name: "DigitalOcean", behavior: "domain", path: "geosite/digitalocean.mrs" },
      { id: "vercel", name: "Vercel", behavior: "domain", path: "geosite/vercel.mrs" },
      { id: "netlify", name: "Netlify", behavior: "domain", path: "geosite/netlify.mrs" },
      { id: "cloudflare-ip", name: "Cloudflare IP", behavior: "ipcidr", path: "geoip/cloudflare.mrs", noResolve: true },
    ],
  },
  {
    id: "dev-tools",
    name: "🛠️ 开发工具",
    emoji: "🛠️",
    category: "tech",
    description: "Docker、npm、JetBrains",
    groupType: "select",
    rules: [
      { id: "docker", name: "Docker", behavior: "domain", path: "geosite/docker.mrs" },
      { id: "npmjs", name: "npmjs", behavior: "domain", path: "geosite/npmjs.mrs" },
      { id: "jetbrains", name: "JetBrains", behavior: "domain", path: "geosite/jetbrains.mrs" },
      { id: "stackexchange", name: "Stack Exchange", behavior: "domain", path: "geosite/stackexchange.mrs" },
    ],
  },
  {
    id: "storage",
    name: "💾 网盘存储",
    emoji: "💾",
    category: "tech",
    description: "Dropbox、Notion",
    groupType: "select",
    rules: [
      { id: "dropbox", name: "Dropbox", behavior: "domain", path: "geosite/dropbox.mrs" },
      { id: "notion", name: "Notion", behavior: "domain", path: "geosite/notion.mrs" },
    ],
  },

  // ==================== 金融服务 ====================
  {
    id: "payment",
    name: "💳 支付平台",
    emoji: "💳",
    category: "finance",
    description: "PayPal、Stripe、Wise 等",
    groupType: "select",
    rules: [
      { id: "paypal", name: "PayPal", behavior: "domain", path: "geosite/paypal.mrs" },
      { id: "stripe", name: "Stripe", behavior: "domain", path: "geosite/stripe.mrs" },
      { id: "wise", name: "Wise", behavior: "domain", path: "geosite/wise.mrs" },
    ],
  },
  {
    id: "crypto",
    name: "₿ 加密货币",
    emoji: "₿",
    category: "finance",
    description: "Binance 等",
    groupType: "select",
    rules: [
      { id: "binance", name: "Binance", behavior: "domain", path: "geosite/binance.mrs" },
    ],
  },

  // ==================== 其他服务 ====================
  {
    id: "google-scholar",
    name: "🎓 谷歌学术",
    emoji: "🎓",
    category: "other",
    description: "Google Scholar 学术搜索",
    groupType: "select",
    rules: [
      { id: "google-scholar", name: "Google Scholar", behavior: "domain", path: "geosite/google-scholar.mrs" },
    ],
  },
  {
    id: "education",
    name: "📚 教育学术",
    emoji: "📚",
    category: "other",
    description: "Coursera、Udemy、学术资源等",
    groupType: "select",
    rules: [
      { id: "category-scholar-!cn", name: "学术资源", behavior: "domain", path: "geosite/category-scholar-!cn.mrs" },
      { id: "coursera", name: "Coursera", behavior: "domain", path: "geosite/coursera.mrs" },
      { id: "udemy", name: "Udemy", behavior: "domain", path: "geosite/udemy.mrs" },
      { id: "edx", name: "edX", behavior: "domain", path: "geosite/edx.mrs" },
      { id: "khanacademy", name: "Khan Academy", behavior: "domain", path: "geosite/khanacademy.mrs" },
      { id: "wikimedia", name: "Wikimedia / Wikipedia", behavior: "domain", path: "geosite/wikimedia.mrs" },
    ],
  },
  {
    id: "news",
    name: "📰 新闻资讯",
    emoji: "📰",
    category: "other",
    description: "BBC、CNN、NYT、Bloomberg 等",
    groupType: "select",
    rules: [
      { id: "bbc", name: "BBC", behavior: "domain", path: "geosite/bbc.mrs" },
      { id: "cnn", name: "CNN", behavior: "domain", path: "geosite/cnn.mrs" },
      { id: "nytimes", name: "NYT", behavior: "domain", path: "geosite/nytimes.mrs" },
      { id: "wsj", name: "WSJ", behavior: "domain", path: "geosite/wsj.mrs" },
      { id: "bloomberg", name: "Bloomberg", behavior: "domain", path: "geosite/bloomberg.mrs" },
    ],
  },
  {
    id: "shopping",
    name: "🛒 海淘购物",
    emoji: "🛒",
    category: "other",
    description: "Amazon、eBay",
    groupType: "select",
    rules: [
      { id: "amazon", name: "Amazon", behavior: "domain", path: "geosite/amazon.mrs" },
      { id: "ebay", name: "eBay", behavior: "domain", path: "geosite/ebay.mrs" },
    ],
  },
  {
    id: "adult",
    name: "🔞 成人内容",
    emoji: "🔞",
    category: "other",
    description: "成人网站（默认关闭）",
    groupType: "select",
    rules: [
      { id: "category-porn", name: "成人网站", behavior: "domain", path: "geosite/category-porn.mrs" },
    ],
  },
];

