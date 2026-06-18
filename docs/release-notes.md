# SubBoost v2.4.1

## 中文

### 多账号与自托管收口

这个版本主要补齐了自托管部署、多账号和配置管理的关键缺口，适合直接部署到自己的生产环境中使用。

### 包含内容

- 单应用容器部署，默认复用外部 PostgreSQL，不再要求本地 `db`/`cron` 容器。
- 新增 GitHub Actions：`main`/PR 自动执行 CI，`v*` tag 自动构建并发布 GHCR 多架构镜像。
- 本地模式支持多账号同权登录，账号可新增、改名、改密码。
- 登录会话改为数据库会话，写接口统一接入 CSRF 校验，并补充同源校验。
- 下线模板库入口，改为真正的配置导入导出，支持 JSON/YAML 导入。

### 安装和更新

- 现有自托管环境升级到这个版本前，请先备份数据库和 `/opt/subboost/.env`。
- 使用外部 PostgreSQL 时，请确认 `DATABASE_URL` 已正确配置。
- 发布后可以继续使用 `subboost update` 更新。

## English

### Self-Hosting and Multi-User Improvements

This release closes several gaps around self-hosting, multi-user access, and configuration management so the project can be deployed more cleanly in a production environment.

### What's Included

- Single-app container deployment with external PostgreSQL as the default production model.
- GitHub Actions for CI on `main` and pull requests, plus multi-arch GHCR image publishing on `v*` tags.
- Multi-account local auth with peer-level accounts, including create, rename, and password update flows.
- Database-backed sessions, CSRF protection for write routes, and same-origin request checks.
- Template library entry removed from local mode and replaced with real JSON/YAML config import and export.

### Installation and Updates

- Back up the database and `/opt/subboost/.env` before upgrading an existing self-hosted installation.
- When using external PostgreSQL, make sure `DATABASE_URL` is configured correctly.
- Future upgrades can continue to use `subboost update`.
