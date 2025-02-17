import { IconButton, Menu } from '@affine/component';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { JournalService } from '@affine/core/modules/journal';
import { useI18n } from '@affine/i18n';
import { EditIcon, TodayIcon } from '@blocksuite/icons/rc';
import type { DocRecord } from '@toeverything/infra';
import { DocsService, useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import * as styles from './journal-conflict-block.css';
import { ResolveConflictOperations } from './menu/journal-conflicts';

export const JournalConflictBlock = ({ date }: { date?: string }) => {
  return date ? <JournalConflictChecker date={date} /> : null;
};

const JournalConflictChecker = ({ date }: { date: string }) => {
  const docRecordList = useService(DocsService).list;
  const journalService = useService(JournalService);
  const docs = useLiveData(
    useMemo(() => journalService.journalsByDate$(date), [journalService, date])
  );
  const docRecords = useLiveData(
    docRecordList.docs$.map(records =>
      records.filter(v => {
        return docs.some(doc => doc.id === v.id);
      })
    )
  );

  if (docRecords.length <= 1) return null;

  return <JournalConflictList docRecords={docRecords} />;
};

const JournalConflictList = ({ docRecords }: { docRecords: DocRecord[] }) => {
  const t = useI18n();
  return (
    <>
      <div className={styles.body}>
        <div className={styles.header}>
          {t['com.affine.editor.journal-conflict.title']()}
        </div>
        {docRecords.map(docRecord => (
          <ConflictItem docRecord={docRecord} key={docRecord.id} />
        ))}
      </div>
      <div className={styles.separator} />
    </>
  );
};

const ConflictItem = ({ docRecord }: { docRecord: DocRecord }) => {
  const docId = docRecord.id;
  const i18n = useI18n();
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const titleMeta = useLiveData(docDisplayMetaService.title$(docId));
  const title = i18n.t(titleMeta);

  return (
    <div className={styles.docItem}>
      <TodayIcon className={styles.icon} />
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        <div className={styles.duplicatedTag}>
          {i18n['com.affine.page-properties.property.journal-duplicated']()}
        </div>
      </div>
      <Menu items={<ResolveConflictOperations docRecord={docRecord} />}>
        <IconButton className={styles.edit} icon={<EditIcon />} />
      </Menu>
    </div>
  );
};
