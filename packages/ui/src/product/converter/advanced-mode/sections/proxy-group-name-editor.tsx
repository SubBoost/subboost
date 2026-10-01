"use client";

import * as React from "react";
import { ChevronDown, Shuffle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { Input } from "@subboost/ui/components/ui/input";
import { Button } from "@subboost/ui/components/ui/button";
import { cn } from "@subboost/ui/lib/utils";
import { splitLeadingEmoji } from "@subboost/core/proxy-group-name";

export type ProxyGroupNameDraft = {
  emoji: string;
  name: string;
};

export type ProxyGroupNameDraftInput = ProxyGroupNameDraft | string | null | undefined;

export const PROXY_GROUP_EMOJI_PALETTE = [
  "🧩",
  "🚀",
  "⚡",
  "🤖",
  "🎯",
  "🔍",
  "🛡️",
  "🌐",
  "📡",
  "🔗",
  "💎",
  "✨",
  "🇺🇸",
  "🇭🇰",
  "🇯🇵",
  "🇸🇬",
  "🇰🇷",
  "🇹🇼",
  "🇬🇧",
  "🇩🇪",
];

const EMOJI_CATEGORY_ROWS = [
  "😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😎 🥳",
  "😏 😌 😔 😪 🤔 🤨 🧐 🤓 😐 😑 😶 🙄 😬 🤥 😴 🤤 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶",
  "😈 👿 👻 💀 ☠️ 👽 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾",
  "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶",
  "💪 🦾 🧠 👀 👁️ 🫀 🫁 🦷 🦴 👤 👥 🗣️",
  "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦅 🦉 🦇 🐺 🐗",
  "🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷️ 🦂 🦟 🦗 🪲 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟",
  "🐬 🐳 🐋 🦈 🦭 🐊 🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐂 🐄 🐎 🐖",
  "🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🍄 🐚 🪨 🌾 💐 🌷 🌹 🥀 🌺",
  "🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡",
  "🔥 💥 ☄️ ☀️ 🌤️ ⛅ 🌥️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌫️ 🌈 ☔ 💧 💦 🌊",
  "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽",
  "🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕",
  "🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮",
  "🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 ☕ 🍵 🧃 🥤 🧋",
  "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊",
  "🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🚣 🧗",
  "🎯 🪄 🎮 🕹️ 🎲 🧩 🧸 🪅 🪩 🪆 ♠️ ♥️ ♦️ ♣️ ♟️ 🃏 🀄 🎴 🎭 🖼️ 🎨 🧵 🪡 🧶",
  "🎼 🎵 🎶 🎙️ 🎚️ 🎛️ 🎤 🎧 📻 🎷 🪗 🎸 🎹 🎺 🎻 🪕 🥁 🪘 📱 📲 ☎️ 📞 📟 📠",
  "🔋 🪫 🔌 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀 🧮 🎥 🎞️ 📽️ 🎬 📺 📷 📸 📹 📼",
  "🔍 🔎 🕯️ 💡 🔦 🏮 🪔 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📄 📰 🗞️ 📑 🔖 🏷️",
  "💰 🪙 💴 💵 💶 💷 💸 💳 🧾 💹 ✉️ 📧 📨 📩 📤 📥 📦 📫 📬 📭 📮 🗳️ ✏️ ✒️",
  "🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📅 📆 🗒️ 🗓️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐",
  "✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐 🔑 🗝️ 🔨 🪓 ⛏️ ⚒️ 🛠️ 🗡️ ⚔️ 💣 🪃 🏹 🛡️ 🪚 🔧",
  "🪛 🔩 ⚙️ 🗜️ ⚖️ 🦯 🔗 ⛓️ 🪝 🧰 🧲 🪜 ⚗️ 🧪 🧫 🧬 🔬 🔭 📡 💉 🩸 💊 🩹 🩺",
  "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🛹 🛼 🚨 🚔 🚍 🚘",
  "🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸",
  "🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🪝 ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠",
  "⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨",
  "🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🛤️ 🛣️ 🗾 🎑 🏞️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆",
  "🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ ◼️ ◻️ ◾ ◽ ▪️ ▫️",
  "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️",
  "☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🔀 🔁 🔂",
  "▶️ ⏩ ⏭️ ⏯️ ◀️ ⏪ ⏮️ 🔼 ⏫ 🔽 ⏬ ⏸️ ⏹️ ⏺️ ⏏️ 🎦 🔅 🔆 📶 📳 📴 ♀️ ♂️ ⚧️",
  "✖️ ➕ ➖ ➗ 🟰 ♾️ ‼️ ⁉️ ❓ ❔ ❕ ❗ 〰️ 💱 💲 ⚕️ ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✅ ☑️ ✔️",
  "❌ ❎ ➰ ➿ 〽️ ✳️ ✴️ ❇️ ©️ ®️ ™️ #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟",
  "🇺🇳 🇺🇸 🇨🇳 🇭🇰 🇲🇴 🇹🇼 🇯🇵 🇰🇷 🇸🇬 🇲🇾 🇹🇭 🇻🇳 🇵🇭 🇮🇩 🇮🇳 🇦🇺 🇳🇿 🇬🇧 🇩🇪 🇫🇷",
  "🇳🇱 🇪🇸 🇵🇹 🇮🇹 🇨🇭 🇸🇪 🇳🇴 🇫🇮 🇩🇰 🇵🇱 🇨🇿 🇦🇹 🇧🇪 🇮🇪 🇨🇦 🇲🇽 🇧🇷 🇦🇷 🇨🇱 🇿🇦",
  "🇦🇪 🇸🇦 🇹🇷 🇮🇱 🇷🇺 🇺🇦",
];

export const PROXY_GROUP_EMOJI_LIBRARY = Array.from(
  new Set([...PROXY_GROUP_EMOJI_PALETTE, ...EMOJI_CATEGORY_ROWS.flatMap((row) => row.split(/\s+/).filter(Boolean))])
);

export function parseProxyGroupNameDraft(raw: string, fallbackEmoji = "🧩"): ProxyGroupNameDraft {
  const safeRaw = typeof raw === "string" ? raw : "";
  const parsed = splitLeadingEmoji(safeRaw);
  if (parsed.hasEmojiPrefix) {
    return { emoji: parsed.emoji, name: parsed.label };
  }
  return {
    emoji: fallbackEmoji.trim(),
    name: safeRaw.trim(),
  };
}

export function toProxyGroupNameDraft(value: ProxyGroupNameDraftInput, fallbackEmoji = "🧩"): ProxyGroupNameDraft {
  if (typeof value === "string") {
    return parseProxyGroupNameDraft(value, fallbackEmoji);
  }

  if (!value || typeof value !== "object") {
    return { emoji: fallbackEmoji.trim(), name: "" };
  }

  return {
    emoji: typeof value.emoji === "string" ? value.emoji.trim() : fallbackEmoji.trim(),
    name: typeof value.name === "string" ? value.name.trim() : "",
  };
}

export function buildProxyGroupName(draft: ProxyGroupNameDraftInput): string {
  const normalized = toProxyGroupNameDraft(draft, "");
  const name = normalized.name.trim();
  const emoji = normalized.emoji.trim();
  if (!name) return "";
  return emoji ? `${emoji} ${name}` : name;
}

export function pickRandomEmoji(current = ""): string {
  const pool = PROXY_GROUP_EMOJI_LIBRARY.filter((emoji) => emoji !== current.trim());
  const choices = pool.length > 0 ? pool : PROXY_GROUP_EMOJI_LIBRARY;
  return choices[Math.floor(Math.random() * choices.length)] ?? "🧩";
}

export function ProxyGroupNameEditor({
  value,
  onChange,
  namePlaceholder = "代理组名称",
  allowEmptyEmoji = true,
  autoFocus,
  className,
  onKeyDown,
}: {
  value: ProxyGroupNameDraftInput;
  onChange: (value: ProxyGroupNameDraft) => void;
  namePlaceholder?: string;
  allowEmptyEmoji?: boolean;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const draft = toProxyGroupNameDraft(value);
  const [query, setQuery] = React.useState("");
  const filteredEmojis = React.useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return PROXY_GROUP_EMOJI_LIBRARY;
    return PROXY_GROUP_EMOJI_LIBRARY.filter((emoji) => emoji.includes(keyword));
  }, [query]);

  const setEmoji = (emoji: string) => {
    onChange({ ...draft, emoji: emoji.trim() });
  };

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1", className)}>
      <div className="relative h-7 w-[51px] shrink-0">
        <Input
          value={draft.emoji}
          onChange={(e) => {
            const next = e.target.value.trim();
            if (!next && !allowEmptyEmoji) return;
            setEmoji(next);
          }}
          className="h-7 w-full pl-2 pr-5 text-center text-xs"
          placeholder={allowEmptyEmoji ? "" : "🧩"}
          title="emoji"
          aria-label="emoji"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 px-0 text-fg-45 hover:text-fg"
              title="选择 emoji"
              aria-label="选择 emoji"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-2 h-7 text-xs"
              placeholder="搜索 emoji"
            />
            <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto pr-1">
              <DropdownMenuItem
                className="flex h-8 items-center justify-center p-0 text-fg-75"
                title="随机 emoji"
                aria-label="随机 emoji"
                onClick={() => setEmoji(pickRandomEmoji(draft.emoji))}
              >
                <Shuffle className="h-3.5 w-3.5" />
              </DropdownMenuItem>
              {filteredEmojis.map((emoji) => (
                <DropdownMenuItem
                  key={emoji}
                  className="flex h-8 items-center justify-center p-0 text-base"
                  onClick={() => setEmoji(emoji)}
                >
                  {emoji}
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Input
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        className="h-7 min-w-0 flex-1 text-xs"
        placeholder={namePlaceholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
