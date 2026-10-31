'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { Spinner } from './Loader';
import { Modal } from './UI';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBytes, optimiseProofImage, TASK_PROOF_RETENTION_DAYS } from '../lib/proof-image.mjs';
import { signedProofUrl, uploadTaskProof } from '../lib/task-proofs';
import { setTaskCompletion } from '../lib/task-data';

// Thumbnail for a stored proof screenshot. A null path means the 30-day cleanup already removed it.
export function ProofThumb({ path, className }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (path) signedProofUrl(path).then((signed) => { if (active) { setUrl(signed); setFailed(!signed); } }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [path]);

  const box = cn('flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-center text-[11.5px] leading-tight text-muted-foreground', className);
  if (!path) return <span className={box} title={`Screenshots are kept for ${TASK_PROOF_RETENTION_DAYS} days`}>Removed after {TASK_PROOF_RETENTION_DAYS} days</span>;
  if (failed) return <span className={box}>Unavailable</span>;
  if (!url) return <span className={box}><Spinner size={14} /></span>;
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL; next/image would need the host allow-listed
  return <a href={url} target="_blank" rel="noreferrer" className={cn(box, 'hover:ring-2 hover:ring-brand/30')} aria-label="Open proof screenshot"><img src={url} alt="Proof screenshot" className="size-full object-cover object-top" loading="lazy" /></a>;
}

function imageFrom(items) {
  for (const item of items || []) {
    const file = item.kind === 'file' ? item.getAsFile() : item;
    if (file && /^image\//.test(file.type || '')) return file;
  }
  return null;
}

// Pick, paste (Ctrl/⌘+V) or drop a screenshot; it is shrunk to WebP, uploaded, and optionally completes the task.
// mode 'complete' uploads then marks the task done; mode 'attach' only uploads.
export function ProofDialog({ task, mode = 'complete', onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const savedProof = useRef(null); // set once the upload succeeds, so a retry only re-runs completion
  const shown = useRef({ task, mode }); // keeps the text steady while the dialog animates closed
  if (task) shown.current = { task, mode };
  const open = Boolean(task);
  const busy = Boolean(step);

  useEffect(() => {
    if (!open) { setFile(null); setStep(''); setError(''); savedProof.current = null; }
  }, [open]);

  // A file dropped beside the drop zone would otherwise make the browser open it and leave the app.
  useEffect(() => {
    if (!open) return undefined;
    const block = (event) => event.preventDefault();
    document.addEventListener('dragover', block);
    document.addEventListener('drop', block);
    return () => { document.removeEventListener('dragover', block); document.removeEventListener('drop', block); };
  }, [open]);

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) return undefined;
    function onPaste(event) {
      const pasted = imageFrom(event.clipboardData?.items);
      if (pasted && !busy) { event.preventDefault(); setError(''); setFile(pasted); }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open, busy]);

  function choose(chosen) {
    setError('');
    if (!chosen) return;
    if (!/^image\//.test(chosen.type || '')) { setError('Choose an image file (a screenshot or photo).'); return; }
    savedProof.current = null;
    setFile(chosen);
  }

  async function submit() {
    if (!file || busy) return;
    setError('');
    try {
      if (!savedProof.current) {
        setStep('Optimising…');
        const optimised = await optimiseProofImage(file);
        setStep('Uploading…');
        const { update, error: uploadError } = await uploadTaskProof(task.id, optimised);
        if (uploadError) throw new Error(uploadError.message);
        savedProof.current = update;
      }
      if (mode === 'complete') {
        setStep('Completing…');
        const { error: completeError } = await setTaskCompletion(task.id, true);
        if (completeError) throw new Error(`The screenshot was saved, but the task could not be completed: ${completeError.message}`);
      }
      setStep('');
      onDone?.({ update: savedProof.current });
    } catch (submitError) {
      setStep('');
      setError(submitError.message || 'The screenshot could not be saved. Please try again.');
    }
  }

  const completing = shown.current.mode === 'complete';
  const title = shown.current.task?.title;
  return <Modal open={open} title={completing ? 'Add proof to complete' : 'Add proof screenshot'} description={completing ? `“${title}” needs a screenshot showing the work is done.` : `Attach a screenshot to “${title}”.`} onClose={() => { if (!busy) onClose(); }}>
    <div className="grid gap-3">
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(imageFrom(event.dataTransfer?.files)); }}
        className={cn('grid min-h-40 place-items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 p-3 text-center transition-colors hover:border-brand/50 hover:bg-brand/5', dragging && 'border-brand bg-brand/5')}
      >
        {preview
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          ? <img src={preview} alt="Selected screenshot" className="max-h-64 max-w-full rounded-md object-contain" />
          : <span className="grid justify-items-center gap-1.5 text-[14px] text-muted-foreground"><Icon name="upload" size={22} className="text-brand" /><span className="font-medium text-foreground">Choose a screenshot</span><span className="max-sm:hidden">or paste it with Ctrl/⌘ + V, or drop it here</span><span className="sm:hidden">from your gallery or camera</span></span>}
      </button>
      {file && <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground"><span className="truncate">{file.name || 'Pasted screenshot'} · {formatBytes(file.size)}</span><button type="button" className="shrink-0 font-medium text-brand hover:underline disabled:opacity-50" disabled={busy} onClick={() => inputRef.current?.click()}>Change</button></div>}
      <p className="text-[12.5px] text-muted-foreground">Images are compressed before upload and deleted after {TASK_PROOF_RETENTION_DAYS} days.</p>
      {error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
      <div className="modal-actions">
        <button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <Button type="button" disabled={!file || busy} onClick={submit}>{busy ? <><Spinner />{step}</> : completing ? <><Icon name="check" size={15} />Upload & complete</> : <><Icon name="upload" size={15} />Upload</>}</Button>
      </div>
    </div>
  </Modal>;
}
