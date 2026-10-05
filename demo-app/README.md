# 企业 OA Low-Code Runtime · Demo App

一个基于 **Vue3 + TypeScript + Vite + Element Plus** 的企业 OA 产品化演示，
消费同仓库的 **Runtime Core**（`../src`），证明该 Runtime 可以支撑真实企业应用。

> Runtime Core 与 Demo Application 完全分离：核心模块零修改，
> 应用侧通过 **Adapter 层** 接入。

## 启动方式

```bash
cd demo-app
npm install
npm run dev
```

浏览器打开：<http://localhost:5173>

## 页面与演示流程

| 页面 | 演示内容 |
|---|---|
| **我的申请** | 采购申请单（申请人/客户类型/公司名称/金额/币种），表单由 Runtime Core 生成；右侧 FieldState Inspector 展示每个状态键的来源（Schema/Rule/BPM/Permission Provider） |
| **审批中心** | 员工填写 → 部门经理审批 → 财务审批 → 完成。点击节点切换 `RuntimeContext`，字段状态实时重算：员工节点 amount 可编辑，经理/财务节点只读，金额 > 5000 显示 warning |
| **Schema 管理** | orderForm 的 v1（历史版本）/ v2（当前版本），查看字段与组件差异（amount: NumberInput → MoneyInput，新增 currency）；演示版本冻结：历史任务永远打开创建时的版本 |
| **数据迁移** | 完整迁移管线：Validation（五类校验器）→ Report → Dry Run（Before/After 预览）→ Execution（Operation Log）。支持切换"坏计划"查看 error 场景 |

右上角 **Runtime Debug** 按钮打开类 DevTools 面板：FormData / Schema /
RuntimeContext / Dependency Graph / Rule Trace / FieldState。

## 架构

```
Backend（mock）
   │ schemaVersion / task node / roles / permissions
   ▼
SchemaVersion Resolver ──▶ Schema Registry ──▶ Schema 实例
                                                │
RuntimeContext（核心适配层拍平为 ctx.* 事实）    │
        │                                       ▼
        └──────────────▶ Rule / BPM / Permission Provider
                                │
                    State Resolution Engine
                    （Permission > BPM > Rule > Schema）
                                │
                         Final FieldState
                                │
Schema ─▶ ComponentMap ─▶ Renderer(buildRenderConfigs)
                                │
                          RuntimeForm（本应用）
                                │
                           Element Plus UI
```

### 关键边界

- **应用不复制任何核心实现**：Schema 解析、规则求值、依赖图、状态决策、迁移校验/执行全部调用 `@runtime-core/*`；
- **Adapter 层**（`src/adapters/`）：
  - `element-component-registry.ts`：把 Element Plus 组件登记进核心 ComponentMap；
  - `host-components.ts`：金额/下拉字段的宿主语义适配（如 readonly 在数字组件上的差异）；
  - `runtime-engine.ts`：编排四个 Provider + StateResolver，并产出依赖图与规则轨迹；
- **单向数据流**：任何交互都走 store 的 `recompute()`，页面不自行维护字段状态；
- **Migration 是旁路**：不进入 Renderer / RuleEngine，只操作内存克隆，历史数据永不修改。

## 目录

```
demo-app/src/
├── main.ts / App.vue
├── layout/        Layout · Sidebar · Header
├── pages/         FormRuntime · ApprovalCenter · SchemaManager · MigrationCenter
├── components/    RuntimeForm · FieldStatePanel · RuleTrace
│                  DependencyGraphView · MigrationReportView · DebugDrawer
├── adapters/      element-component-registry · host-components · runtime-engine
├── stores/        runtime-store（单一数据源）
├── router/
└── mock/          schema · runtime-context · form-data · migration-data · version-registry
```
