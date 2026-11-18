/// <reference types="expo/types" />
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Kit, KitLabel, Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { titleDetailRows } from './title-details-rows';
import styles from './title-details.module.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function TitleDetails({ title, kits, labels, onClose }: { title: Title; kits?: Kit[]; labels?: KitLabel[]; onClose: () => void }) {
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
  return <div className={styles.scrim} onClick={onClose}>
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
          {kits && labels && <>
            <h3 className={styles.heading}>Kit labels</h3>
            {kits.length === 0 ? <p className={styles.muted}>No physical kits for this title.</p> : <ul className={styles.kits}>
              {kits.map((kit) => {
                const names = kit.labelIds.map((id) => labelById.get(id)?.name).filter(Boolean) as string[];
                return <li key={kit.id}>
                  <span className={styles.kit}>{kit.barcode} · {kit.branch}</span>
                  <span className={styles.chips}>
                    {names.length ? names.map((name) => <span key={name} className={styles.chip}>{name}</span>) : <span className={styles.muted}>No labels</span>}
                  </span>
                </li>;
              })}
            </ul>}
            <p className={styles.muted}>Labels describe individual kits and do not reserve a kit or guarantee availability. Scheduling may assign any eligible kit for this title.</p>
          </>}
        </div>
      </div>
    </div>
  </div>;
}
