import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface FileDropProps {
  onFiles: (files: FileList | File[]) => void;
  accept: string;
  title: string;
  hint: ReactNode;
  icon: LucideIcon;
  multiple?: boolean;
  compact?: boolean;
  count?: number;
  disabled?: boolean;
}

export function FileDrop({
  onFiles,
  accept,
  title,
  hint,
  icon: Icon,
  multiple = true,
  compact = false,
  count = 0,
  disabled = false,
}: FileDropProps) {
  const depth = useRef(0);
  const hostRef = useRef<HTMLLabelElement>(null);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const [dragging, setDragging] = useState(false);

  // Paste (Ctrl+V) into whichever dropzone is currently visible.
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const host = hostRef.current;
      if (!host || host.closest('[hidden]') || !event.clipboardData) return;
      const files = Array.from(event.clipboardData.files ?? []);
      if (!files.length) {
        for (const item of Array.from(event.clipboardData.items ?? [])) {
          if (item.kind !== 'file') continue;
          const pasted = item.getAsFile();
          if (pasted) files.push(pasted);
        }
      }
      if (!files.length) return;
      event.preventDefault();
      onFilesRef.current(files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [disabled]);

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    depth.current += 1;
    if (event.dataTransfer.types.includes('Files')) setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (!disabled && event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
  };

  return (
    <label
      ref={hostRef}
      className={[
        'drop',
        compact ? 'drop-compact' : '',
        dragging ? 'is-drag' : '',
        disabled ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        className="visually-hidden"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={title}
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <span className="drop-icon" aria-hidden="true">
        <Icon />
      </span>

      {compact ? (
        <>
          <span className="drop-copy">
            <span className="drop-title">{title}</span>
            <span className="drop-hint">{hint}</span>
          </span>
          <span className="drop-count">
            {count} {count === 1 ? 'file' : 'files'}
          </span>
        </>
      ) : (
        <>
          <span className="drop-title">{dragging ? 'Release to add' : title}</span>
          <span className="drop-hint">{hint}</span>
          <span className="drop-paste">or press Ctrl / ⌘ + V to paste</span>
        </>
      )}
    </label>
  );
}
