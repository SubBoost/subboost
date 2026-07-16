<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="平台：Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.6.0-green.svg" alt="版本 2.6.0">
    <a href="https://subboost.org"><img src="https://img.shields.io/badge/app-subboost.org-brightgreen.svg" alt="在线入口"></a>
    <a href="https://docs.subboost.org"><img src="https://img.shields.io/badge/docs-subboost.org-blue.svg" alt="文档"></a>
    <img src="https://img.shields.io/badge/image-GHCR-blue.svg" alt="GHCR 镜像">
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** 是一个 **Clash/Mihomo 订阅转换、增强和管理** 工具。可以将机场订阅和自建节点转换为优化后的聚合订阅，并自动更新。通过 UI 可视化，一键实现 **链式代理、精确分流、防 DNS 泄露和多订阅聚合** 等高级功能。

## 亮点与场景

- **订阅转换**：支持订阅链接、YAML 文件和节点链接等多种格式导入。
- **节点管理**：支持批量对节点重命名、删除或配置监听端口。
- **节点筛选**：可在分流组高级模式中按导入源、地区和自定义规则筛选节点。
- **链式代理**：一键可视化配置链式代理和 `中转代理组`。
- **精确分流**：内置 30 多个常用代理组和 2000 多条远程规则集供启用。
- **规则管理**：可修改规则顺序，供高级用户深度自定义。
- **防 DNS 泄露**：默认的 `基础和 DNS 配置` 可防止 DNS 泄露。
- **自动刷新**：定时自动刷新订阅，刷新时可智能匹配节点。

## 界面展示

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost 可视化配置界面" width="960">
</p>

## 使用和部署

- 在线入口：[无需部署 - 直接使用的公益服务](https://subboost.org)
- 部署文档：[一键部署 - 拉取镜像构建，速度快配置要求低](https://docs.subboost.org/deploy/one-click)
- 部署文档：[高级部署 - 编译源码构建，速度慢配置要求高](https://docs.subboost.org/deploy/advanced)
- 配置教程：[草履虫也能学会的 Clash 配置：UI 界面一键配置精确分流、链式代理](https://ryanvan.com/t/topic/59?u=ryan)

## 开发说明

开发者可以从源码启动本地开发环境：

```bash
npm ci
npm run dev
```

常用检查：

```bash
npm run lint
npm run test:unit
npm run check:local-app
```

## 相关链接

- 在线入口：[https://subboost.org](https://subboost.org)
- 部署文档：[https://docs.subboost.org](https://docs.subboost.org)
- 发行公告：[docs/release-notes.md](./docs/release-notes.md)
- 更新日志：[https://subboost.org/faq](https://subboost.org/faq)
- 社区反馈：[LINUX DO](https://linux.do/) & [IDC Flare](https://idcflare.com/)；同时感谢论坛中小伙伴们的积极讨论和反馈

## 开源许可

SubBoost 公开源码以 [GNU Affero General Public License v3.0 only](./LICENSE) 授权。

如果你修改 SubBoost 并通过网络向用户提供服务，AGPL-3.0 要求你向这些用户提供对应源码。公开源码入口是 [SubBoost/subboost](https://github.com/SubBoost/subboost)。

## 免责声明

本项目不提供任何代理服务，不对第三方订阅内容的可用性与合法性作出保证。
