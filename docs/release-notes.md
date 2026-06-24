# SubBoost v2.5.0

## 中文

### 更新重点

SubBoost v2.5.0 主要改善代理组编辑、自部署更新和订阅生成稳定性。建议 v2.4.0 用户升级。

### 主要变化

- **移除筛选代理组**，相关功能转移到分流代理组高级模式和自定义分流组。
- 分流代理组高级模式支持按来源、地区、关键词和排除条件整理节点。
- 订阅生成更稳，规则顺序、代理组输出和常见 Mihomo 字段处理减少了意外变化。
- 节点导入兼容性更好，覆盖更多常见节点链接和 Mihomo YAML 配置。
- 自部署安装和更新流程更可靠，`subboost update`、状态检查和失败提示都有改进。
- Dashboard 下载订阅 YAML 的行为更接近直接访问订阅链接，文件名和响应头更稳定。
- 首次安装后的管理员初始化、登录和数据库连接更稳，减少安装完成后进不去后台的情况。
- 安全和发布检查加强，降低公开包、安装资产和更新流程出错的风险。

### 升级说明

- 建议升级前备份 `/opt/subboost/.env` 和数据库，方便需要时回滚。
- 已安装 v2.4.0 的自部署实例可以继续使用 `subboost update` 更新。
- 普通订阅转换、模板和规则功能不需要手动改环境变量。
- 如果你在 v2.4.0 使用过筛选代理组，请升级后到自定义代理组或分流代理组高级模式里重新配置。

## English

### Highlights

SubBoost v2.5.0 mainly improves proxy group editing, self-hosted updates, and subscription generation stability. v2.4.0 users are encouraged to upgrade.

### Main Changes

- Removed filtered proxy groups. Related features have moved to proxy group advanced mode and custom proxy groups.
- Proxy group advanced mode supports organizing nodes by source, region, keyword, and exclusion rules.
- Made subscription generation more stable, reducing unexpected changes in rule order, proxy group output, and common Mihomo fields.
- Improved node import compatibility for more common node links and Mihomo YAML configurations.
- Made self-hosted install and update flows more reliable, including `subboost update`, status checks, and failure messages.
- Dashboard YAML downloads now behave more like direct subscription links, with steadier filenames and response headers.
- Improved first-install admin setup, login, and database connection reliability to reduce post-install access issues.
- Strengthened safety and release checks to reduce the risk of problems in public packages, install assets, and updates.

### Upgrade Notes

- Back up `/opt/subboost/.env` and the database before upgrading so rollback is easier if needed.
- Existing v2.4.0 self-hosted installations can continue to update with `subboost update`.
- Normal subscription conversion, templates, and rules do not require manual environment-variable changes.
- If you used filtered proxy groups in v2.4.0, reconfigure them after upgrading through custom proxy groups or proxy group advanced mode.
