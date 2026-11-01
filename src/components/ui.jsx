import React, {createContext, useCallback, useContext, useEffect, useId, useRef, useState} from 'react';
import {X} from 'lucide-react';

// ---------- 시트(모달) ----------
const sheetStack = [];
/** 안드로이드 뒤로가기: 열려 있는 시트가 있으면 먼저 닫습니다. */
export function closeTopSheet() { const top = sheetStack[sheetStack.length - 1]; if (!top) return false; top(); return true; }

export function Sheet({title, onClose, children, footer, size}) {
  const ref = useRef(null), titleId = useId(), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement, close = () => closeRef.current();
    sheetStack.push(close);
    document.body.classList.add('no-scroll');
    const first = ref.current?.querySelector('input,select,textarea,button:not(.sheet-x)');
    (first || ref.current)?.focus({preventScroll: true});
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    window.addEventListener('popstate', close);
    return () => {
      document.removeEventListener('keydown', key); window.removeEventListener('popstate', close);
      const i = sheetStack.indexOf(close); if (i >= 0) sheetStack.splice(i, 1);
      if (!sheetStack.length) document.body.classList.remove('no-scroll');
      prev?.focus?.({preventScroll: true});
    };
  }, []);
  return <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={'sheet' + (size === 'sm' ? ' sheet-sm' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
      <div className="sheet-head"><h2 id={titleId}>{title}</h2><button type="button" className="sheet-x icon-btn" aria-label="닫기" onClick={onClose}><X size={20}/></button></div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
  </div>;
}

// ---------- 토스트 / 확인창 ----------
const OverlayCtx = createContext(null);
export const useOverlay = () => useContext(OverlayCtx);
export function OverlayProvider({children}) {
  const [toasts, setToasts] = useState([]), [dlg, setDlg] = useState(null);
  const toast = useCallback((text, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t.slice(-2), {id, text, ...opts}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.action ? 8000 : opts.kind === 'error' ? 7000 : 4000);
    return id;
  }, []);
  const confirm = useCallback(o => new Promise(res => setDlg({...o, res})), []);
  const close = v => { dlg.res(v); setDlg(null); };
  return <OverlayCtx.Provider value={{toast, confirm}}>
    {children}
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={'toast' + (t.kind === 'error' ? ' error' : '')}>
        <span>{t.text}</span>
        {t.action && <button type="button" onClick={() => { t.action.onClick(); setToasts(x => x.filter(y => y.id !== t.id)); }}>{t.action.label}</button>}
        <button type="button" className="icon-btn" aria-label="알림 닫기" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}><X size={16}/></button>
      </div>)}
    </div>
    {dlg && <Sheet size="sm" title={dlg.title || '확인'} onClose={() => close(false)} footer={<>
      <button type="button" onClick={() => close(false)}>{dlg.cancelLabel || '취소'}</button>
      <button type="button" className={dlg.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dlg.confirmLabel || '확인'}</button></>}>
      <p className="pre">{dlg.body}</p>
    </Sheet>}
  </OverlayCtx.Provider>;
}

// ---------- 작은 컴포넌트 ----------
export function Field({label, hint, children, className}) {
  return <label className={'field ' + (className || '')}><span className="field-label">{label}</span>{children}{hint && <small className="hint">{hint}</small>}</label>;
}
export function Segmented({value, onChange, options, label}) {
  return <div className="seg" role="tablist" aria-label={label}>
    {options.map(([v, text]) => <button type="button" role="tab" aria-selected={value === v} key={v} className={value === v ? 'selected' : ''} onClick={() => onChange(v)}>{text}</button>)}
  </div>;
}
export function Dot({color}) { return <span className="dot" style={{background: color}} aria-hidden="true"/>; }
export function PatientChip({patient, color}) { return patient ? <span className="pchip"><Dot color={color}/>{patient.name}</span> : null; }
export function Empty({icon: Icon, title, children}) { return <div className="empty">{Icon && <Icon size={34} aria-hidden="true"/>}<strong>{title}</strong>{children && <p>{children}</p>}</div>; }
export function Badge({children, tone}) { return <span className={'badge ' + (tone || '')}>{children}</span>; }
export function Section({title, action, children, id}) {
  return <section className="panel" aria-labelledby={id}><div className="panel-head"><h3 id={id}>{title}</h3>{action}</div>{children}</section>;
}
export function PageHeader({title, onBack, right}) {
  return <div className="page-head">{onBack && <button type="button" className="icon-btn" aria-label="뒤로" onClick={onBack}>‹</button>}<h2>{title}</h2><div className="grow"/>{right}</div>;
}
export function FormActions({busy, onCancel, submitLabel = '저장'}) {
  return <div className="form-actions">{onCancel && <button type="button" onClick={onCancel}>취소</button>}<button className="primary" disabled={busy}>{busy ? '처리 중...' : submitLabel}</button></div>;
}
