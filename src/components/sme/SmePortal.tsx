import { useMemo, useState } from 'react';
import type { Profile } from '../../types/database';
import { SmeBatchDetailView } from './SmeBatchDetailView';
import { SmeBatchesView } from './SmeBatchesView';
import { SmeLayout, type SmeBreadcrumb } from './SmeLayout';

interface SmePortalProps {
  userId: string;
  profile: Profile;
  onLogout: () => void;
  loggingOut?: boolean;
}

export function SmePortal({
  userId,
  profile,
  onLogout,
  loggingOut = false,
}: SmePortalProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchCode, setSelectedBatchCode] = useState<string | null>(
    null,
  );

  const breadcrumbs = useMemo<SmeBreadcrumb[]>(() => {
    if (!selectedBatchId) {
      return [{ label: 'My Batches' }];
    }
    return [
      {
        label: 'My Batches',
        onClick: () => {
          setSelectedBatchId(null);
          setSelectedBatchCode(null);
        },
      },
      { label: selectedBatchCode ?? 'Batch Details' },
    ];
  }, [selectedBatchId, selectedBatchCode]);

  return (
    <SmeLayout
      profile={profile}
      breadcrumbs={breadcrumbs}
      isBatchDetailOpen={Boolean(selectedBatchId)}
      onNavigateMyBatches={() => {
        setSelectedBatchId(null);
        setSelectedBatchCode(null);
      }}
      onLogout={onLogout}
      loggingOut={loggingOut}
    >
      {selectedBatchId ? (
        <SmeBatchDetailView
          batchId={selectedBatchId}
          userId={userId}
          onBack={() => {
            setSelectedBatchId(null);
            setSelectedBatchCode(null);
          }}
          onBatchCodeLoaded={setSelectedBatchCode}
        />
      ) : (
        <SmeBatchesView
          userId={userId}
          onSelectBatch={(b) => {
            setSelectedBatchCode(b.batch_code);
            setSelectedBatchId(b.id);
          }}
        />
      )}
    </SmeLayout>
  );
}
