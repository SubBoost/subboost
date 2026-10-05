# SubBoost v2.9.0

## 中文

### 新增

- 新增明暗主题切换；未手动选择时跟随系统设置，并改善按钮、标签和平板导航的显示。
- 新增订阅链接二维码，方便在其他设备上扫码导入。
- 增强规则配置：支持手动添加和批量导入 MRS 规则集、按名称保留或排除节点，以及为自动测速代理组设置独立测速地址。

### 修复

- 改善外部订阅导入的完整性，修复部分协议字段在导入或生成配置时丢失的问题。
- 修复刷新、重命名节点后部分链式代理和代理组引用失效，以及预置规则移动到其他代理组后未生效的问题。
- 修复切换订阅或账号时编辑内容串用、旧请求覆盖当前状态的问题；浏览器存储不可用时仍可继续编辑当前配置。
- 修复退出登录后旧会话仍可继续使用的问题，并更新相关依赖。

### 升级说明

- 自部署用户可在正式发行后运行 `subboost update`。升级器会先创建并验证数据库备份；新版本启动时自动创建退出登录记录表，无需手动执行数据库迁移。使用源码部署的用户应运行项目数据库迁移命令后再启动。

## English

### New Features

- Added light and dark themes. The theme follows system settings until manually selected, with improved buttons, labels, and tablet navigation.
- Added QR codes for subscription links, making it easier to import subscriptions on other devices.
- Expanded rule configuration with manual addition and batch import of MRS rule sets, node inclusion and exclusion by name, and separate test URLs for automatic latency-testing proxy groups.

### Fixes

- Improved the completeness of external subscription imports and fixed protocol fields being lost during import or configuration generation.
- Fixed some chained proxy and proxy group references breaking after node refreshes or renames, and preset rules not taking effect after being moved to another proxy group.
- Fixed editing content carrying over when switching subscriptions or accounts, and stale requests overwriting the current state. The current configuration remains editable when browser storage is unavailable.
- Fixed old sessions remaining usable after logout and updated related dependencies.

### Upgrade Notes

- Self-hosted users can run `subboost update` after the stable release is published. The updater first creates and verifies a database backup, and the new version automatically creates the logout-record table at startup, without a manual database migration. Users deploying from source should run the project's database migration command before starting the application.
