import { useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteGate } from '@/features/auth/permissions';
import { GenerateFeesDialog } from '@/features/fee-charges/generate-fees-dialog';
import { TransactionListPage } from '../components/transaction-list-page';

export default function ReceivablesPage() {
  const [generateOpen, setGenerateOpen] = useState(false);
  return (
    <>
      <TransactionListPage
        type="income"
        actions={
          <WriteGate>
            <Button variant="soft" onClick={() => setGenerateOpen(true)}>
              <ReceiptText /> Gerar honorários
            </Button>
          </WriteGate>
        }
      />
      <GenerateFeesDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </>
  );
}
