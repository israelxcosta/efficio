import { useState } from 'react';
import { toast } from 'sonner';
import type { AuditExportQuery } from '@effinance/shared';
import { toastError } from '@/lib/notify';
import { downloadAuditCsv } from '@/features/workspaces/api';

/** Downloads the audit trail CSV (a period, or the records about to be deleted) with its feedback. */
export function useAuditDownload() {
  const [downloading, setDownloading] = useState(false);
  async function download(query: AuditExportQuery = {}) {
    setDownloading(true);
    try {
      await downloadAuditCsv(query);
      toast.success('Registro de auditoria baixado', { description: 'Guarde o arquivo CSV em local seguro.' });
    } catch (error) {
      toastError(error);
    } finally {
      setDownloading(false);
    }
  }
  return { download, downloading };
}
