'use client';

import { createPortal } from 'react-dom';
import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';

export default function TaskTextTooltip({ text, className = '', children }) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const tooltipId = `task-tooltip-${useId().replaceAll(':', '')}`;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const placeAbove = bounds.top > window.innerHeight * 0.65;
    const maxWidth = Math.min(360, window.innerWidth - 24);
    const left = Math.min(Math.max(12, bounds.left), window.innerWidth - maxWidth - 12);
    setPosition({
      left,
      maxWidth,
      placement: placeAbove ? 'above' : 'below',
      top: placeAbove ? bounds.top - 8 : bounds.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    updatePosition();
    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const triggerContent = children
    ? cloneElement(children, { 'aria-describedby': open ? tooltipId : undefined })
    : text;

  return <>
    <span
      ref={triggerRef}
      className={`task-tooltip-trigger${className ? ` ${className}` : ''}`}
      aria-describedby={!children && open ? tooltipId : undefined}
      tabIndex={children ? undefined : 0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >{triggerContent}</span>
    {open && position && typeof document !== 'undefined' ? createPortal(
      <span
        id={tooltipId}
        className={`task-tooltip task-tooltip-${position.placement}`}
        role="tooltip"
        style={{ left: position.left, maxWidth: position.maxWidth, top: position.top }}
      >{text}</span>,
      document.body,
    ) : null}
  </>;
}
