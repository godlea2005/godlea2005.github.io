export type CommerceStep = 1 | 2 | 3;

type CommerceStepRailProps = {
  currentStep: CommerceStep;
  furthestStep: CommerceStep;
  onSelect: (step: CommerceStep) => void;
};

const steps = [
  { step: 1 as const, label: "产品", detail: "资料与图片" },
  { step: 2 as const, label: "市场", detail: "平台与语境" },
  { step: 3 as const, label: "确认", detail: "授权与提交" },
];

export function CommerceStepRail({
  currentStep,
  furthestStep,
  onSelect,
}: CommerceStepRailProps) {
  return (
    <nav
      className="commerce-step-rail"
      aria-label="填写步骤"
      data-current-step={currentStep}
    >
      {steps.map(({ step, label, detail }) => (
        <button
          type="button"
          key={step}
          aria-current={currentStep === step ? "step" : undefined}
          disabled={step > furthestStep}
          onClick={() => onSelect(step)}
        >
          <span>0{step}</span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </button>
      ))}
    </nav>
  );
}
