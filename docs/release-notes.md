# SubBoost v2.11.0

## 中文

- 扩展自定义规则，支持更多 Mihomo 规则类型、AND/OR/NOT 逻辑组合及批量导入格式，改进规则参数和目标的保留。
- 新增订阅链接重置，可在订阅设置中更换链接并使旧链接失效。
- 改进规则格式识别、兼容健康检查的共享，以及移动端设置与弹窗布局。
- 改进部分 VLESS Reality 链接的导入兼容性。
- 修复大备份校验误报导致自部署升级中止的问题。

升级提示：如果旧版更新时出现 `read=141 pg_restore=0`，请先使用本次发布附带的独立修复脚本更新管理器，再运行 `subboost update`。修复脚本保留备份校验，不修改数据库和应用配置。

## English

- Expand custom rules with more Mihomo rule types, AND/OR/NOT logical combinations, and batch import formats, with improved preservation of rule parameters and targets.
- Add subscription link reset in subscription settings, replacing the link and invalidating the previous one.
- Improve rule format detection, sharing of compatible health checks, and mobile settings and dialog layouts.
- Improve import compatibility for certain VLESS Reality links.
- Fix false verification failures on large backups that could abort self-hosted updates.

Upgrade note: If an older installation reports `read=141 pg_restore=0` during an update, first use this release's standalone repair script to refresh the manager, then run `subboost update`. The repair script preserves backup verification and does not modify the database or application configuration.
