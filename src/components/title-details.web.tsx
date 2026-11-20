/// <reference types="expo/types" />
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { KitLabel, Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { titleDetailRows } from './title-details-rows';
import { useDiscussionNotes } from './use-discussion-notes';
import styles from './title-details.module.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function TitleDetails({ title, labels, onClose, children }: { title: Title; labels?: KitLabel[]; onClose: () => void; children?: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  function trapFocus(event: ReactKeyboardEvent) {
    if (event.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const labelById = new Map((labels ?? []).map((label) => [label.id, label]));
  const rows = titleDetailRows(title).filter(([label]) => label !== 'Author');
  const discussionNotes = useDiscussionNotes(title.id);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className={styles.scrim} onClick={onClose}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="title-details-name" tabIndex={-1}
      onClick={(event) => event.stopPropagation()} onKeyDown={trapFocus}>
      <button type="button" className={styles.close} aria-label="Close details" onClick={onClose}>×</button>
      <div className={styles.layout}>
        <div className={styles.cover}>
          <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: '100%', height: '100%', borderRadius: 0, marginRight: 0 }} />
        </div>
        <div className={styles.body}>
          <h2 id="title-details-name" className={styles.name}>{title.name}</h2>
          {title.author ? <p className={styles.author}>{title.author}</p> : null}
          {rows.length > 0 && <dl className={styles.facts}>
            {rows.map(([label, value]) => <div key={label} className={styles.fact}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>)}
          </dl>}
          <h3 className={styles.heading}>Description</h3>
          <p className={styles.synopsis}>{title.synopsis || 'No description stored for this title.'}</p>
          <h3 className={styles.heading}>Discussion notes</h3>
          <p className={styles.synopsis}>{discussionNotes}</p>
          {labels && <>
            <h3 className={styles.heading}>Title labels</h3>
            <span className={styles.chips}>
              {title.labelIds.length ? title.labelIds.map((id) => labelById.get(id)).filter((label): label is KitLabel => !!label)
                .map((label) => <span key={label.id} className={styles.chip}>{label.name}</span>) : <span className={styles.muted}>No labels</span>}
            </span>
            {title.labelIds.some((id) => !labelById.has(id)) && <p className={styles.muted}>Some title labels are unavailable. Refresh or contact staff.</p>}
            <p className={styles.muted}>Labels do not reserve a kit or guarantee availability.</p>
          </>}
          {children}
        </div>
      </div>
    </div>
  </div>, document.body);
}
