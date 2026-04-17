import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type InlineEditType = 'text' | 'email' | 'number' | 'select';

interface SelectOption {
  value: string;
  label: string;
}

interface InlineEditableCellProps {
  value: string | number;
  onSave: (newValue: string) => Promise<void>;
  type?: InlineEditType;
  options?: SelectOption[];
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  /** Pencil icon always visible (mobile). When false, show only on hover (desktop). */
  alwaysShowIcon?: boolean;
  disabled?: boolean;
  renderDisplay?: (value: string | number) => React.ReactNode;
}

const InlineEditableCell: React.FC<InlineEditableCellProps> = ({
  value,
  onSave,
  type = 'text',
  options = [],
  placeholder,
  className,
  displayClassName,
  alwaysShowIcon = false,
  disabled = false,
  renderDisplay,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));
  const [isUpdating, setIsUpdating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep edit value in sync with external value when not editing
  useEffect(() => {
    if (!isEditing) setEditValue(String(value ?? ''));
  }, [value, isEditing]);

  // Focus text input when entering edit mode
  useEffect(() => {
    if (isEditing && type !== 'select' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, type]);

  // Cancel editing when a Dialog/Sheet opens over us (prevents aria-hidden-on-focused-element warning).
  // Radix Dialog sets aria-hidden on the rest of the DOM; if our button/input still has focus, 
  // the browser logs a warning. We cancel editing proactively when we detect this.
  useEffect(() => {
    if (!isEditing) return;

    const handleFocusOut = () => {
      // If focus leaves the container entirely (not moving to our own child buttons), cancel.
      requestAnimationFrame(() => {
        if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
          cancelEdit();
        }
      });
    };

    // Also cancel if the page becomes hidden (tab switch, etc.)
    const handleVisibilityChange = () => {
      if (document.hidden) cancelEdit();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = useCallback(() => {
    if (disabled || isUpdating) return;
    setEditValue(String(value ?? ''));
    setIsEditing(true);
  }, [disabled, isUpdating, value]);

  const cancelEdit = useCallback(() => {
    setEditValue(String(value ?? ''));
    setIsEditing(false);
  }, [value]);

  const commitEdit = useCallback(async () => {
    const trimmed = editValue.trim();
    if (trimmed === String(value ?? '').trim()) {
      setIsEditing(false);
      return;
    }
    setIsUpdating(true);
    setIsEditing(false);
    try {
      await onSave(trimmed);
    } finally {
      setIsUpdating(false);
    }
  }, [editValue, value, onSave]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { cancelEdit(); }
  };

  const handleSelectChange = async (newValue: string) => {
    if (newValue === String(value ?? '')) { setIsEditing(false); return; }
    setIsUpdating(true);
    setIsEditing(false);
    try { await onSave(newValue); }
    finally { setIsUpdating(false); }
  };

  // Loading spinner
  if (isUpdating) {
    return (
      <div className={cn('flex items-center gap-1.5 text-muted-foreground', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span className="text-sm truncate">{String(value)}</span>
      </div>
    );
  }

  // Editing — Select
  // NOTE: We do NOT use open={true} here because Radix Select uses a Dialog-like portal
  // internally when forced open, which triggers a "DialogContent requires DialogTitle" warning.
  // Instead we auto-open via the onOpenChange callback after mount.
  if (isEditing && type === 'select') {
    return (
      <div
        ref={containerRef}
        className={cn('flex items-center gap-1', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <Select
          value={editValue}
          onValueChange={(v) => { handleSelectChange(v); }}
          onOpenChange={(open) => { if (!open) cancelEdit(); }}
          defaultOpen
        >
          <SelectTrigger className="h-8 text-sm border-procarni-primary/50 focus:ring-procarni-primary/30 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* tabIndex={-1} prevents the browser from including this button in the normal
            tab order while the select dropdown is open, avoding the aria-hidden warning */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
          className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors"
          aria-label="Cancelar edición"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Editing — Text / Email / Number
  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className={cn('flex items-center gap-1', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitEdit}
          className="h-8 text-sm border-procarni-primary/50 focus-visible:ring-procarni-primary/30 py-1 px-2"
          placeholder={placeholder}
        />
        {/* tabIndex={-1}: keep these out of the normal focus ring so that when a Dialog
            opens over the page, these buttons don't trigger the aria-hidden warning */}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); commitEdit(); }}
          className="h-7 w-7 flex items-center justify-center rounded text-procarni-secondary hover:bg-green-50 shrink-0 transition-colors"
          aria-label="Guardar"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}
          className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Display mode
  return (
    <div
      className={cn(
        'group/cell flex items-center gap-1.5',
        !disabled && !alwaysShowIcon && 'cursor-pointer',
        !disabled && alwaysShowIcon && 'cursor-default',
        className
      )}
      onClick={!disabled && !alwaysShowIcon ? (e) => { e.stopPropagation(); startEdit(); } : undefined}
    >
      <span className={cn('text-sm', displayClassName)}>
        {renderDisplay
          ? renderDisplay(value)
          : (String(value) || <span className="text-gray-400 italic text-xs">{placeholder || '—'}</span>)
        }
      </span>
      {!disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); startEdit(); }}
          className={cn(
            'h-5 w-5 flex items-center justify-center rounded text-gray-300 hover:text-procarni-primary hover:bg-procarni-primary/10 shrink-0 transition-all duration-150',
            alwaysShowIcon
              ? 'opacity-60 hover:opacity-100'
              : 'opacity-0 group-hover/cell:opacity-100'
          )}
          title="Editar campo"
          aria-label="Editar campo"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default InlineEditableCell;
