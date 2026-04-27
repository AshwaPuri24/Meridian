// ============================================================
// Meridian — iconography (minimal stroke icons)
// ============================================================

const Ic = ({ path, size = 14, fill = "none", stroke = "currentColor", sw = 1.5, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {path ? <path d={path} /> : children}
  </svg>
);

const Icons = {
  Menu: p => <Ic {...p}><path d="M4 7h16M4 12h16M4 17h16"/></Ic>,
  Map: p => <Ic {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></Ic>,
  Pulse: p => <Ic {...p}><path d="M3 12h4l2-7 4 14 2-7h6"/></Ic>,
  Ship: p => <Ic {...p}><path d="M3 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0M4 14l8-3 8 3M6 14V8h12v6M12 3v5"/></Ic>,
  Alert: p => <Ic {...p}><path d="M12 3 2 20h20L12 3zM12 10v5M12 18v.5"/></Ic>,
  Brain: p => <Ic {...p}><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3 3 3 0 0 0 3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0 3-3 3 3 0 0 0 2-3 3 3 0 0 0-2-3V7a3 3 0 0 0-3-3 3 3 0 0 0-3 2 3 3 0 0 0-3-2zM12 6v14"/></Ic>,
  Route: p => <Ic {...p}><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h6a5 5 0 0 1 0 10H11a5 5 0 0 0 0 10h6"/></Ic>,
  Graph: p => <Ic {...p}><path d="M3 3v18h18M7 14l4-4 3 3 6-7"/></Ic>,
  Truck: p => <Ic {...p}><path d="M3 17V7h11v10M14 10h4l3 4v3h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></Ic>,
  Settings: p => <Ic {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V22a2 2 0 1 1-4 0v-.1a2 2 0 0 0-1.2-1.8 2 2 0 0 0-2.2.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a2 2 0 0 0 .4-2.2 2 2 0 0 0-1.8-1.2H2a2 2 0 1 1 0-4h.1A2 2 0 0 0 4 9a2 2 0 0 0-.4-2.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a2 2 0 0 0 2.2.4H9a2 2 0 0 0 1.2-1.8V2a2 2 0 1 1 4 0v.1a2 2 0 0 0 1.2 1.8 2 2 0 0 0 2.2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a2 2 0 0 0-.4 2.2V9a2 2 0 0 0 1.8 1.2H22a2 2 0 1 1 0 4h-.1a2 2 0 0 0-1.8 1.2z"/></Ic>,
  Search: p => <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></Ic>,
  Bell: p => <Ic {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></Ic>,
  Play: p => <Ic {...p}><path d="M6 4v16l14-8z"/></Ic>,
  Pause: p => <Ic {...p}><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></Ic>,
  Check: p => <Ic {...p}><path d="M4 12l5 5L20 6"/></Ic>,
  X: p => <Ic {...p}><path d="M6 6l12 12M18 6 6 18"/></Ic>,
  Plus: p => <Ic {...p}><path d="M12 5v14M5 12h14"/></Ic>,
  Zoom: p => <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M21 21l-4.3-4.3"/></Ic>,
  Filter: p => <Ic {...p}><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/></Ic>,
  Arrow: p => <Ic {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Ic>,
  Gauge: p => <Ic {...p}><path d="M12 14l4-4M3 12a9 9 0 0 1 18 0 9 9 0 0 1-2.6 6.4"/></Ic>,
  Layers: p => <Ic {...p}><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></Ic>,
  Globe: p => <Ic {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></Ic>,
  Temp: p => <Ic {...p}><path d="M10 13V4a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/></Ic>,
  Clock: p => <Ic {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Ic>,
  Sun:  p => <Ic {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></Ic>,
  Moon: p => <Ic {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></Ic>,
};

window.Icons = Icons;
