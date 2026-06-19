<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="Platform: Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.4.0-green.svg" alt="Version 2.4.0">
    <a href="https://subboost.org"><img src="https://img.shields.io/badge/app-subboost.org-brightgreen.svg" alt="Online app"></a>
    <a href="https://docs.subboost.org"><img src="https://img.shields.io/badge/docs-subboost.org-blue.svg" alt="Documentation"></a>
    <img src="https://img.shields.io/badge/image-GHCR-blue.svg" alt="GHCR image">
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** is a **Clash/Mihomo subscription conversion, enhancement, and management** tool. It can convert airport subscriptions and self-hosted nodes into optimized aggregate subscriptions, then update them automatically. With the visual UI, you can configure advanced features such as **chained proxies, precise routing, DNS leak prevention, and multi-subscription aggregation** in one click.

## Highlights & Use Cases

- **Subscription conversion**: Import subscription links, YAML files, node links, and other common formats.
- **Node management**: Rename, delete, or configure listening ports for nodes in batches.
- **Node filtering**: Build `filtered proxy groups` with only selected nodes by source, region, and custom rules.
- **Chained proxies**: Configure chained proxies and `relay proxy groups` visually in one click.
- **Precise routing**: Enable more than 30 common proxy groups and over 2,000 remote rule sets.
- **Rule management**: Reorder rules for deeper customization by advanced users.
- **DNS leak prevention**: The default `basic and DNS configuration` helps prevent DNS leaks.
- **Automatic refresh**: Refresh subscriptions on a schedule and intelligently match nodes during refresh.

## Interface Preview

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost visual configuration interface" width="960">
</p>

## Usage & Deployment

- Online entry: [No deployment required - direct access to the public service](https://subboost.org)
- Deployment docs: [One-click deployment - pulls an image to build, faster with lower requirements](https://docs.subboost.org/deploy/one-click)
- Deployment docs: [Advanced deployment - compiles from source, slower with higher requirements](https://docs.subboost.org/deploy/advanced)
- Configuration guide: [Clash configuration simple enough for a paramecium: configure precise routing and chained proxies from the UI in one click](https://ryanvan.com/t/topic/59?u=ryan)

### LAN mode (no login)

When self-hosting on a trusted private network, you can enable LAN mode: it skips login/authentication and auto-provisions a default admin account, so there is no account to create and no login step. In LAN mode every visitor shares this single default admin (any existing login session is ignored), and the admin-setup endpoint is disabled. Set this in your deployment `.env`:

```env
SUBBOOST_LAN_MODE=true
# Optional: customize the default admin username (defaults to admin)
# SUBBOOST_LAN_ADMIN_USERNAME=admin
# Optional: set a password so the account stays usable if LAN mode is later turned off
# SUBBOOST_LAN_ADMIN_PASSWORD=
```

> ⚠️ LAN mode fully disables authentication. Use it only on a trusted private network and never expose the service to the internet. It is disabled by default. Note: subscription links (`/api/subscriptions/<token>/config.yaml`) are already token-based and require no login regardless of this switch.

## Development Notes

Developers can start a local development environment from source:

```bash
npm ci
npm run dev
```

Common checks:

```bash
npm run lint
npm run test:unit
npm run check:local-app
```

## Links

- Online entry: [https://subboost.org](https://subboost.org)
- Deployment docs: [https://docs.subboost.org](https://docs.subboost.org)
- Release announcements: [docs/release-notes.md](./docs/release-notes.md)
- Changelog: [https://subboost.org/faq](https://subboost.org/faq)
- Community feedback: [LINUX DO](https://linux.do/) & [IDC Flare](https://idcflare.com/); thanks to everyone in the forums for the active discussion and feedback.

## License

The public SubBoost source code is licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).

If you modify SubBoost and provide it to users over a network, AGPL-3.0 requires you to offer those users the corresponding source code. The public source entry is [SubBoost/subboost](https://github.com/SubBoost/subboost).

## Disclaimer

This project does not provide any proxy service and makes no guarantee about the availability or legality of third-party subscription content.
