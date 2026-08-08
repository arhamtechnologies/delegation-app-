export function Icon({ name, size = 18, strokeWidth = 1.8, className = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };

  const shapes = {
    grid: <><rect {...common} x="3" y="3" width="7" height="7" rx="1" /><rect {...common} x="14" y="3" width="7" height="7" rx="1" /><rect {...common} x="3" y="14" width="7" height="7" rx="1" /><rect {...common} x="14" y="14" width="7" height="7" rx="1" /></>,
    clipboard: <><rect {...common} x="5" y="4" width="14" height="17" rx="2" /><path {...common} d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" /></>,
    users: <><path {...common} d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle {...common} cx="10" cy="7" r="3" /><path {...common} d="M17 11a3 3 0 0 0 0-6M20 20v-1.5a3.5 3.5 0 0 0-2.4-3.3" /></>,
    chart: <><path {...common} d="M4 19V5M4 19h17" /><path {...common} d="m7 15 3-4 3 2 5-7" /><circle {...common} cx="18" cy="6" r="1" /></>,
    bell: <><path {...common} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    settings: <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8.1 15a1.7 1.7 0 0 0-1.6-1H6v-2.5h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.1h2.5v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1V14h-.1a1.7 1.7 0 0 0-1.6 1Z" /></>,
    search: <><circle {...common} cx="10.8" cy="10.8" r="6.8" /><path {...common} d="m16 16 5 5" /></>,
    plus: <><path {...common} d="M12 5v14M5 12h14" /></>,
    arrowUpRight: <><path {...common} d="M5 19 19 5M9 5h10v10" /></>,
    clock: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M12 7v5l3 2" /></>,
    checkCircle: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="m8 12 2.5 2.5L16 9" /></>,
    warning: <><path {...common} d="m12 3 9 17H3L12 3Z" /><path {...common} d="M12 9v4M12 16h.01" /></>,
    menu: <><path {...common} d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path {...common} d="m6 6 12 12M18 6 6 18" /></>,
    chevronRight: <path {...common} d="m9 18 6-6-6-6" />,
    chevronDown: <path {...common} d="m6 9 6 6 6-6" />,
    filter: <><path {...common} d="M4 5h16M7 12h10M10 19h4" /></>,
    download: <><path {...common} d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>,
    more: <><circle {...common} cx="5" cy="12" r="1" /><circle {...common} cx="12" cy="12" r="1" /><circle {...common} cx="19" cy="12" r="1" /></>,
    calendar: <><rect {...common} x="3" y="4" width="18" height="17" rx="2" /><path {...common} d="M16 2v4M8 2v4M3 9h18" /></>,
    user: <><circle {...common} cx="12" cy="8" r="3" /><path {...common} d="M5 21a7 7 0 0 1 14 0" /></>,
    logout: <><path {...common} d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5" /></>,
    paperclip: <path {...common} d="m20.5 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.6-7.6" />,
    message: <><path {...common} d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3-.5L4 20l1.5-4A7.5 7.5 0 1 1 20 11.5Z" /><path {...common} d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    activity: <><path {...common} d="M3 12h4l2-7 4 14 2-7h6" /></>,
    shield: <><path {...common} d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path {...common} d="m9 12 2 2 4-4" /></>,
    sparkles: <><path {...common} d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2L12 3ZM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z" /></>,
    briefcase: <><rect {...common} x="3" y="6" width="18" height="13" rx="2" /><path {...common} d="M8 6V4h8v2M3 11h18M10 11v2h4v-2" /></>,
    check: <path {...common} d="m5 12 4 4L19 6" />,
    edit: <><path {...common} d="m4 16-.8 4.8L8 20l11-11a2.8 2.8 0 0 0-4-4L4 16Z" /><path {...common} d="m13.5 6.5 4 4" /></>,
    lock: <><rect {...common} x="4" y="10" width="16" height="11" rx="2" /><path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    trend: <><path {...common} d="M4 17 9 12l3 3 7-8" /><path {...common} d="M15 7h4v4" /></>,
    list: <><path {...common} d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></>,
  };

  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{shapes[name] || shapes.grid}</svg>;
}
