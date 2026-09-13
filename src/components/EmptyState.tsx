import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  message: string;
};

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <p className="empty-note">{message}</p>
    </div>
  );
}
