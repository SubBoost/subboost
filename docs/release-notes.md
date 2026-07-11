# SubBoost v2.6.0

## 中文

### 更新重点

SubBoost v2.6.0 改进了高级代理组的成员管理，并增强多种订阅格式和 ECH 参数的兼容性。自部署备份流程也更加可靠。建议 v2.5.1 用户升级。

### 主要变化

- 高级代理组现在可以一键添加或移除全部节点、全部代理组，并可恢复默认成员；批量添加代理组时会自动跳过可能形成循环引用的项目。
- 代理组成员区域会分别显示节点数和代理组数，代理组卡片的节点统计只计算真实节点，不再把 `DIRECT`、`REJECT` 或其它代理组引用计入节点数量。
- 改进 Clash/Mihomo YAML 导入兼容性，可识别以单行对象列表书写的节点配置，并容忍这类列表中常见的缩进不一致。
- 修复 VMess、VLESS、Trojan 和 AnyTLS 分享链接中的 ECH 查询服务器名称在转换时丢失的问题。
- 自部署备份现在会在数据库导出失败时安全终止，不再把不完整文件当作成功备份；备份保留数量可通过 `SUBBOOST_BACKUP_RETENTION_COUNT` 调整，默认仍保留 10 份。

### 升级说明

- 建议升级前备份 `/opt/subboost/.env` 和数据库，方便需要时回滚。
- 现有 v2.5.1 自部署实例可以继续使用 `subboost update` 更新。
- 本次升级不要求手动迁移数据库，也不要求新增环境变量；只有需要修改默认备份保留数量时，才需要设置 `SUBBOOST_BACKUP_RETENTION_COUNT`。
- 现有订阅、模板、规则和高级代理组配置保持兼容，不会因为升级自动改写成员选择。

## English

### Highlights

SubBoost v2.6.0 improves member management for advanced proxy groups and expands compatibility with several subscription formats and ECH parameters. It also makes self-hosted backups more reliable. Users on v2.5.1 are encouraged to upgrade.

### Main Changes

- Advanced proxy groups can now add or remove all nodes or all proxy groups in one action, and restore their default members. Bulk proxy-group additions automatically skip entries that could create circular references.
- Proxy-group member sections now show separate node and proxy-group counts. Node totals on proxy-group cards count real nodes only, excluding `DIRECT`, `REJECT`, and references to other proxy groups.
- Improved Clash/Mihomo YAML import compatibility for node configurations written as lists of single-line objects, including common indentation inconsistencies in those lists.
- Fixed ECH query server names being lost when converting VMess, VLESS, Trojan, and AnyTLS share links.
- Self-hosted backups now stop safely when the database export fails instead of treating an incomplete file as a successful backup. Backup retention can be adjusted with `SUBBOOST_BACKUP_RETENTION_COUNT`, while the default remains 10 backups.

### Upgrade Notes

- Back up `/opt/subboost/.env` and the database before upgrading so rollback is easier if needed.
- Existing v2.5.1 self-hosted installations can continue to update with `subboost update`.
- This upgrade does not require a manual database migration or a new environment variable. Set `SUBBOOST_BACKUP_RETENTION_COUNT` only if you want to change the default backup retention count.
- Existing subscriptions, templates, rules, and advanced proxy-group configurations remain compatible, and upgrading does not automatically rewrite member selections.
