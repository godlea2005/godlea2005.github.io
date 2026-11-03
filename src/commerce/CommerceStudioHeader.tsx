type CommerceStudioHeaderProps = {
  creditsLabel: string;
  authenticated: boolean;
  accountLabel?: string;
  historyCount: number | null;
  onOpenHistory: () => void;
};

export function CommerceStudioHeader({
  creditsLabel,
  authenticated,
  accountLabel,
  historyCount,
  onOpenHistory,
}: CommerceStudioHeaderProps) {
  return (
    <header className="commerce-studio-header">
      <div>
        <span>AI COMMERCE STUDIO</span>
        <h1>AI 电商视觉工作台</h1>
        <p>
          从产品事实到市场表达，把主图、详情分镜与作图提示词整理成一份可执行方案。
        </p>
      </div>
      <div className="commerce-studio-tools">
        <p>
          <span>可用额度</span>
          <strong>{creditsLabel}</strong>
        </p>
        {authenticated && (
          <button type="button" onClick={onOpenHistory} aria-haspopup="dialog">
            历史项目 <span>{historyCount ?? "查看"}</span>
          </button>
        )}
        {authenticated && (
          <p className="commerce-account">
            <span>账户</span>
            <strong>{accountLabel || "已登录"}</strong>
          </p>
        )}
      </div>
    </header>
  );
}
