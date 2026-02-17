# 依赖兼容性评估

> 评估日期：2026-02-17
> 评估人：ops-developer
> 项目：nestjs-indexer v0.2.0
> 总计过时依赖：29 → 已更新 15，剩余 4 待独立处理

## 基准状态（更新前）

| 检查项 | 状态 |
|--------|------|
| 构建 (tsdown) | ✅ 通过 |
| 测试 (vitest 88 tests) | ⚠️ 87/88 通过（exports.test.ts 超时） |
| publint | ✅ 无问题 |

## 更新后状态

| 检查项 | 状态 |
|--------|------|
| 构建 (tsdown) | ✅ 通过 |
| 测试 (vitest 88 tests) | ✅ **88/88 全部通过**（vitest 升级修复了超时问题） |
| publint | ✅ 无问题 |

---

## ✅ 已安全更新（15 个，全部为 patch/minor）

### cli catalog

| 包 | 变更前 | 变更后 | 类型 |
|----|--------|--------|------|
| `@antfu/ni` | ^28.0.0 | ^28.2.0 | minor |
| `bumpp` | ^10.3.2 | ^10.4.1 | minor |
| `publint` | ^0.3.16 | ^0.3.17 | patch |
| `vite` | ^7.2.7 | ^7.3.1 | minor |

### runtime catalog

| 包 | 变更前 | 变更后 | 类型 |
|----|--------|--------|------|
| `@nestjs/common` | ^11.0.11 | ^11.1.13 | minor |
| `@nestjs/core` | ^11.0.11 | ^11.1.13 | minor |
| `@nestjs/platform-express` | ^11.0.11 | ^11.1.13 | minor |
| `@nestjs/testing` | ^11.0.11 | ^11.1.13 | minor |
| `ioredis` | ^5.9.1 | ^5.9.3 | patch |
| `redlock-universal` | ^0.8.1 | ^0.8.2 | patch |

### testing catalog

| 包 | 变更前 | 变更后 | 类型 |
|----|--------|--------|------|
| `@vitest/coverage-v8` | ^4.0.17 | ^4.0.18 | patch |
| `vitest` | ^4.0.15 | ^4.0.18 | patch |

### types catalog

| 包 | 变更前 | 变更后 | 类型 |
|----|--------|--------|------|
| `@types/node` | ^25.0.1 | ^25.2.3 | minor |

---

## ⚠️ 未更新（4 个，需独立评估）

| 包 | 当前 | 最新 | 原因 |
|----|------|------|------|
| `@antfu/eslint-config` | ^6.6.1 | ^7.4.3 | **Major 升级**，需与 eslint 10 配合测试，配置 API 可能变化 |
| `eslint` | ^9.39.2 | ^10.0.0 | **Major 升级**，影响所有 eslint 插件和配置文件 |
| `tsdown` | ^0.17.3 | ^0.20.3 | 0.x 阶段 minor 可能有 breaking changes；当前版本已标记 deprecated（"unexpected breaking change in copy behavior"） |
| `vitest-package-exports` | ^0.1.1 | ^1.2.0 | **Major 升级** (0.x → 1.x)，API 变化未评估 |

### 建议处理策略

1. **ESLint 生态链** (`@antfu/eslint-config` + `eslint`)：作为一组在独立分支升级，需验证 eslint.config.mjs 兼容性
2. **tsdown**：等 0.20.x 稳定后升级，或直接跳至下一稳定版；需特别注意 copy behavior 变更
3. **vitest-package-exports**：独立评估 1.x API，当前 0.1.1 的 exports 测试已通过

---

## 附加发现

- `tsdown@0.17.3` 已被上游标记为 deprecated："Including an unexpected breaking change (copy behavior)"
- vitest 4.0.15 → 4.0.18 的 patch 更新解决了 `test/exports.test.ts` 的超时问题
- simple-git-hooks 在子模块环境中无法正常工作（`.git` 是文件非目录），但不影响 CI
