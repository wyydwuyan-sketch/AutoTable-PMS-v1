export function AiModelsConfig() {
  return (
    <div className="grid-root" style={{ padding: 24, overflowY: 'auto' }}>
      <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
        模型管理
      </h4>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        当前版本提供入口与占位内容，后续可在此维护模型接入配置、版本与权限。
      </p>
      <div style={{ marginTop: 16, border: '1px solid var(--border-color)', borderRadius: 10, padding: 16, background: 'var(--bg-panel)' }}>
        <p style={{ marginBottom: 0, fontSize: 14, color: 'var(--text-main)' }}>
          建议下一步增加模型提供商配置、默认模型选择和调用配额策略。
        </p>
      </div>
    </div>
  )
}
