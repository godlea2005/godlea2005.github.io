import { ModalSurface } from "../components/ModalSurface";
import type { CommerceRepository } from "./commerceRepository";
import { CommerceHistory } from "./CommerceHistory";
import type {
  CommerceGeneration,
  CommerceProject,
  CommerceResult,
} from "./types";

type CommerceHistoryDrawerProps = {
  open: boolean;
  onClose: () => void;
  repository: CommerceRepository;
  onSelectResult: (
    result: CommerceResult,
    project: CommerceProject,
    generation: CommerceGeneration,
  ) => void;
  refreshKey?: number;
  liveGeneration?: CommerceGeneration | null;
  excludedProjectIds?: ReadonlySet<string>;
  onCountChange?: (count: number) => void;
};

export function CommerceHistoryDrawer({
  open,
  onClose,
  onSelectResult,
  ...historyProps
}: CommerceHistoryDrawerProps) {
  if (!open) return null;
  return (
    <ModalSurface
      className="commerce-history-layer"
      label="历史项目"
      onClose={onClose}
    >
      <div className="commerce-history-drawer-shell">
        <header className="commerce-history-drawer-header">
          <div>
            <span>PROJECT ARCHIVE</span>
            <h2 data-modal-focus tabIndex={-1}>
              历史项目
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭历史项目">
            ×
          </button>
        </header>
        <CommerceHistory
          {...historyProps}
          onSelectResult={(result, project, generation) => {
            onSelectResult(result, project, generation);
            onClose();
          }}
        />
      </div>
    </ModalSurface>
  );
}
