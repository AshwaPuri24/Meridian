// ============================================================
// Meridian — Global Map Monitoring (Google Maps API)
// v2 — interactive routes, floating card, ripple, polish
// ============================================================


// ── Great-circle arc ─────────────────────────────────────────
function gcArc(a, b, steps) {
  steps = steps || 80;
  var toRad = function(d) { return d * Math.PI / 180; };
  var toDeg = function(r) { return r * 180 / Math.PI; };
  var pts = [];
  var lat1 = toRad(a.lat), lng1 = toRad(a.lng);
  var lat2 = toRad(b.lat), lng2 = toRad(b.lng);
  var sinDlat = Math.sin((lat2 - lat1) / 2);
  var sinDlng = Math.sin((lng2 - lng1) / 2);
  var d = 2 * Math.asin(Math.sqrt(
    sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlng * sinDlng
  ));
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    if (d < 0.0001) { pts.push({ lat: a.lat, lng: a.lng }); continue; }
    var A = Math.sin((1 - t) * d) / Math.sin(d);
    var B = Math.sin(t * d) / Math.sin(d);
    var x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    var y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    var z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push({
      lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lng: toDeg(Math.atan2(y, x))
    });
  }
  return pts;
}

// ── Route & hazard data ──────────────────────────────────────
var GMAP_ROUTES = [
  { id:"R1", from:{lat:40.71,lng:-74.01}, to:{lat:51.51,lng:-0.13},    label:"New York → London",          ship:"MDR-745",   cargo:"Electronics",  type:"active",   progress:0.52, confidence:92, risk:"MEDIUM" },
  { id:"R2", from:{lat:31.23,lng:121.47}, to:{lat:34.05,lng:-118.24},  label:"Shanghai → Los Angeles",     ship:"MRD-48244", cargo:"Auto Parts",   type:"rerouted", progress:0.38, confidence:76, risk:"HIGH"   },
  { id:"R3", from:{lat:1.35,lng:103.82},  to:{lat:51.92,lng:4.48},     label:"Singapore → Rotterdam",      ship:"MDR-882",   cargo:"Chemicals",    type:"active",   progress:0.71, confidence:88, risk:"LOW"    },
  { id:"R4", from:{lat:25.20,lng:55.27},  to:{lat:19.08,lng:72.88},    label:"Dubai → Mumbai",             ship:"MDR-521",   cargo:"Petroleum",    type:"active",   progress:0.85, confidence:95, risk:"LOW"    },
  { id:"R5", from:{lat:-33.87,lng:151.21},to:{lat:1.35,lng:103.82},    label:"Sydney → Singapore",         ship:"MDR-334",   cargo:"Mining Ore",   type:"delayed",  progress:0.24, confidence:64, risk:"HIGH"   },
];

var GMAP_HAZARDS = [
  { id:"H1", lat:-5,  lng:-30, radius:900000, name:"Tropical Storm 'Epsilon'", risk:"HIGH",   severity:82, impacted:14, status:"Active" },
  { id:"H2", lat:14,  lng:62,  radius:620000, name:"Rough Seas Advisory",      risk:"MEDIUM", severity:55, impacted:6,  status:"Active" },
];

var DARK_MAP_STYLE = [
  // Higher contrast dark map for enterprise dashboard
  { elementType:"geometry",                                                           stylers:[{color:"#06111e"}] },
  { elementType:"labels.text.stroke",                                                 stylers:[{color:"#06111e"}] },
  { elementType:"labels.text.fill",                                                   stylers:[{color:"#3a4a5f"},{lightness:-20}] },

  // Remove all POI clutter
  { featureType:"poi",                                                                stylers:[{visibility:"off"}] },
  { featureType:"poi.business",                                                       stylers:[{visibility:"off"}] },
  { featureType:"poi.government",                                                     stylers:[{visibility:"off"}] },
  { featureType:"poi.park",                                                           stylers:[{visibility:"off"}] },
  { featureType:"poi.attraction",                                                     stylers:[{visibility:"off"}] },
  { featureType:"poi.school",                                                         stylers:[{visibility:"off"}] },

  // Roads - subtle and de-emphasized
  { featureType:"road",                       elementType:"geometry",                 stylers:[{color:"#112236"},{saturation:-90},{lightness:-34}] },
  { featureType:"road",                       elementType:"labels.text.fill",         stylers:[{color:"#25374b"}] },
  { featureType:"road",                       elementType:"labels.text.stroke",       stylers:[{color:"#090d14"}] },
  { featureType:"road.highway",               elementType:"geometry",                 stylers:[{color:"#1a2b3f"},{saturation:-92},{lightness:-30}] },
  { featureType:"road.highway",               elementType:"labels",                   stylers:[{visibility:"off"}] },
  { featureType:"road.arterial",              elementType:"labels",                   stylers:[{visibility:"off"}] },
  { featureType:"road.local",                 elementType:"labels",                   stylers:[{visibility:"off"}] },

  // Transit - minimal
  { featureType:"transit",                    elementType:"geometry",                 stylers:[{color:"#0a111a"}] },
  { featureType:"transit",                    elementType:"labels",                   stylers:[{visibility:"off"}] },

  // Water + land contrast
  { featureType:"water",                      elementType:"geometry",                 stylers:[{color:"#03101b"}] },
  { featureType:"water",                      elementType:"labels.text.fill",         stylers:[{color:"#20364f"}] },

  // Land slightly brighter than ocean
  { featureType:"landscape",                  elementType:"geometry",                 stylers:[{color:"#0b1c2f"}] },
  { featureType:"landscape.natural",          elementType:"geometry",                 stylers:[{color:"#0b1c2f"}] },
  { featureType:"landscape.man_made",         elementType:"geometry",                 stylers:[{color:"#0b1c2f"}] },

  // Administrative - ultra subtle borders
  { featureType:"administrative",             elementType:"labels.text.fill",         stylers:[{color:"#2c3d51"},{visibility:"off"}] },
  { featureType:"administrative.country",     elementType:"geometry.stroke",          stylers:[{color:"#22384f"},{weight:0.35}] },
  { featureType:"administrative.province",    elementType:"geometry.stroke",          stylers:[{color:"#1a3047"},{weight:0.25}] },
  { featureType:"administrative.locality",    elementType:"labels",                   stylers:[{visibility:"off"}] },

  // Remove text labels for clean look
  { featureType:"administrative",             elementType:"labels",                   stylers:[{visibility:"off"}] },
];

// ── Helpers ──────────────────────────────────────────────────
// Strict color system: green=safe, red=high risk, amber=delayed, violet=AI reroute
function routeBaseColor(r) {
  if (r.type === 'rerouted') return '#8b5cf6';
  if (r.type === 'delayed') return '#f59e0b';
  if (r.risk === 'HIGH') return '#ef4444';
  return '#22c55e';
}

function dashedIcons(color, opacity, scale) {
  return [{ icon:{ path:'M 0,-1 0,1', strokeOpacity: opacity, strokeColor: color, scale: scale || 3 }, offset:'0', repeat:'14px' }];
}

function riskColor(risk) {
  return risk === 'HIGH' ? 'var(--alert)' : risk === 'MEDIUM' ? 'var(--warn)' : 'var(--ok)';
}

function GlobalMapFallback(props) {
  var routes = props.routes;
  var hazards = props.hazards;
  var selectedRouteId = props.selectedRouteId;
  var onSelectRoute = props.onSelectRoute;
  var onSelectHazard = props.onSelectHazard;
  var error = props.error;

  return (
    <div className="gmap-fallback">
      <div className="gmap-fallback-map" aria-label="Fallback route network">
        <svg viewBox="0 0 900 460" role="img">
          <path className="gfm-grid" d="M40 110 H860 M40 210 H860 M40 310 H860 M120 40 V420 M300 40 V420 M480 40 V420 M660 40 V420 M820 40 V420" />
          <path className="gfm-land" d="M72 170 C145 85 254 86 319 150 C390 219 346 329 238 344 C134 358 55 284 72 170Z" />
          <path className="gfm-land" d="M531 126 C633 50 770 85 820 190 C880 316 716 392 592 329 C502 283 451 185 531 126Z" />
          <circle className="gfm-hazard high" cx="410" cy="245" r="54" />
          <circle className="gfm-hazard warn" cx="675" cy="210" r="42" />
          {routes.map(function(route, index) {
            var y = 112 + index * 58;
            var selected = route.id === selectedRouteId;
            return (
              <g key={route.id} className={selected ? "gfm-route selected" : "gfm-route"} onClick={function() { onSelectRoute(route); }}>
                <path d={"M95 " + y + " C260 " + (y - 70) + " 475 " + (y + 84) + " 800 " + (y - 15)} stroke={routeBaseColor(route)} />
                <circle cx={95} cy={y} r="6" fill={routeBaseColor(route)} />
                <circle cx={800} cy={y - 15} r="6" fill={routeBaseColor(route)} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="gmap-fallback-panel">
        <div className="gfp-eyebrow">Fallback network view</div>
        <h3>Google Maps is unavailable</h3>
        <p>{error || "The interactive map could not be loaded. Routes, hazards, and selections remain available here."}</p>
        <div className="gfp-list">
          {routes.map(function(route) {
            return (
              <button key={route.id} className={"gfp-route" + (route.id === selectedRouteId ? " active" : "")} onClick={function() { onSelectRoute(route); }}>
                <span className="gfp-route-dot" style={{background: routeBaseColor(route)}} />
                <span>
                  <strong>{route.ship}</strong>
                  <small>{route.label}</small>
                </span>
                <em>{route.risk}</em>
              </button>
            );
          })}
        </div>
        <div className="gfp-hazards">
          {hazards.map(function(hazard) {
            return (
              <button key={hazard.id} onClick={function() { onSelectHazard(hazard); }}>
                <span>{hazard.name}</span>
                <strong>{hazard.impacted} impacted</strong>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────
function GlobalMapView(props) {
  var onBack = props.onBack;

  // Refs — map & overlays
  var mapRef          = React.useRef(null);
  var mapInst         = React.useRef(null);
  var overlays        = React.useRef({ lines: [], circles: [], markers: [], intervals: [] });
  var linesByRoute    = React.useRef({});   // { routeId: Polyline }
  var highlightFn     = React.useRef(null); // synchronous map highlight fn
  var selectedRouteIdRef = React.useRef(null);

  // State
  var _mapsLoaded = React.useState(function() { return !!(window.google && window.google.maps); });
  var mapsLoaded = _mapsLoaded[0]; var setMapsLoaded = _mapsLoaded[1];
  var _mapError = React.useState(null);
  var mapError = _mapError[0]; var setMapError = _mapError[1];

  var _selRoute = React.useState(GMAP_ROUTES[0]);
  var selectedRoute = _selRoute[0]; var setSelectedRoute = _selRoute[1];

  var _selId = React.useState(GMAP_ROUTES[0].id);
  var selectedRouteId = _selId[0]; var setSelectedRouteId = _selId[1];

  var _hazard = React.useState(null);
  var activeHazard = _hazard[0]; var setActiveHazard = _hazard[1];

  var _floatCard = React.useState(null);  // { route, x, y }
  var floatCard = _floatCard[0]; var setFloatCard = _floatCard[1];

  var _layers = React.useState({ hazards:true, traffic:false, weather:true, aiRoutes:true });
  var layers = _layers[0]; var setLayers = _layers[1];
  var _filters = React.useState({ active:true, risk:true, delayed:true, rerouted:true });
  var filters = _filters[0]; var setFilters = _filters[1];

  // ── Load Google Maps API ─────────────────────────────────
  React.useEffect(function() {
    if (window.google && window.google.maps) { setMapsLoaded(true); setMapError(null); return; }
    var cbName = '__meridianGmapLoaded';
    var done = false;
    var failTimer = setTimeout(function() {
      if (!done && !(window.google && window.google.maps)) {
        setMapError('Google Maps did not respond in time. Use this fallback until the API key or network is available.');
      }
    }, 8000);
    window[cbName] = function() {
      done = true;
      clearTimeout(failTimer);
      setMapError(null);
      setMapsLoaded(true);
    };

    var existing = document.getElementById('meridian-google-maps-sdk-full');
    if (existing) {
      existing.addEventListener('load', window[cbName], { once: true });
      existing.addEventListener('error', function() {
        clearTimeout(failTimer);
        setMapError('Google Maps could not load. Check VITE_GOOGLE_MAPS_KEY and network access.');
      }, { once: true });
      return function() { clearTimeout(failTimer); };
    }

    var s = document.createElement('script');
    s.id = 'meridian-google-maps-sdk-full';
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + GMAP_API_KEY + '&callback=' + cbName;
    s.async = true; s.defer = true;
    s.onerror = function() {
      clearTimeout(failTimer);
      setMapError('Google Maps could not load. Check VITE_GOOGLE_MAPS_KEY and network access.');
    };
    document.head.appendChild(s);
    return function() { clearTimeout(failTimer); };
  }, []);

  // ── Initialize map ───────────────────────────────────────
  React.useEffect(function() {
    selectedRouteIdRef.current = selectedRouteId;
  }, [selectedRouteId]);

  React.useEffect(function() {
    if (!mapsLoaded || !mapRef.current || mapInst.current) return;

    var map = new google.maps.Map(mapRef.current, {
      center: { lat: 20, lng: 10 },
      zoom: 2, minZoom: 2,
      styles: DARK_MAP_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      gestureHandling: 'greedy',
      backgroundColor: '#030c18',
    });
    mapInst.current = map;

    // ── Highlight function (synchronous map update) ────────
    // Visual hierarchy: Level 1 (selected) > Level 2 (other routes) > Level 3 (background)
    highlightFn.current = function(selId) {
      GMAP_ROUTES.forEach(function(r) {
        var line = linesByRoute.current[r.id];
        if (!line) return;
        var col = routeBaseColor(r);
        var isR = r.type === 'rerouted';
        var isSelected = (r.id === selId);
        var isNoneSelected = !selId;

        if (isSelected) {
          // Level 1: Focused route
          line.setOptions({
            strokeOpacity: isR ? 0 : 1.0,
            strokeWeight: 5.2,
            strokeColor: '#0ea5e9',
            zIndex: 30,
            icons: isR ? dashedIcons('#0ea5e9', 1, 4) : [],
          });
        } else if (isNoneSelected) {
          // Level 2: All routes visible at base weight
          line.setOptions({
            strokeOpacity: isR ? 0 : 0.75,
            strokeWeight: r.type === 'active' ? 3.4 : r.type === 'delayed' ? 2.9 : 2.6,
            zIndex: 5,
            icons: isR ? dashedIcons(col, 0.9, 2.6) : [],
          });
        } else {
          // Level 3: Fade unselected
          line.setOptions({
            strokeOpacity: isR ? 0 : 0.18,
            strokeWeight: 1.5,
            zIndex: 1,
            icons: isR ? dashedIcons(col, 0.22, 2) : [],
          });
        }
      });
    };

    // ── Draw route polylines ───────────────────────────────
    GMAP_ROUTES.forEach(function(r) {
      var pts  = gcArc(r.from, r.to);
      var isR  = r.type === 'rerouted';
      var col  = routeBaseColor(r);

      var line = new google.maps.Polyline({
        path: pts, geodesic: false,
        strokeColor: col,
        strokeOpacity: isR ? 0 : 0.9,
        strokeWeight: r.type === 'active' ? 3.4 : r.type === 'delayed' ? 2.9 : 2.6,
        icons: isR ? dashedIcons(col, 0.95, 2.6) : [],
        map: map, clickable: true, zIndex: 1,
      });

      // Hover — subtle glow + brighten (Level 2 → Level 1 transition)
      line.addListener('mouseover', function() {
        var line2 = linesByRoute.current[r.id];
        if (line2) {
          var isSel = (selectedRouteIdRef.current === r.id);
          line2.setOptions({
            strokeWeight: isSel ? 5.2 : 4.2,
            strokeOpacity: isR ? 0 : (isSel ? 1.0 : 0.9),
            zIndex: isSel ? 20 : 10,
          });
        }
      });
      line.addListener('mouseout', function() {
        var line2 = linesByRoute.current[r.id];
        if (!line2) return;
        var isSel = (selectedRouteIdRef.current === r.id);
        if (isSel) {
          line2.setOptions({ strokeWeight: 4.8, strokeOpacity: isR ? 0 : 1.0, zIndex: 20 });
        } else {
          var hasSelection = (selectedRouteIdRef.current !== null);
          line2.setOptions({
            strokeWeight: r.type === 'active' ? 3.4 : r.type === 'delayed' ? 2.9 : 2.6,
            strokeOpacity: isR ? 0 : (hasSelection ? 0.18 : 0.82),
            zIndex: 5,
          });
        }
      });

      // Click — select + floating card + action bar
      line.addListener('click', function(event) {
        line.setOptions({ strokeWeight: 5.4, strokeColor: '#0ea5e9' });
        setTimeout(function() {
          if (highlightFn.current) highlightFn.current(r.id);
        }, 150);

        setSelectedRouteId(r.id);
        setSelectedRoute(r);
        window.__MERIDIAN_SELECTED_SHIPMENT__ = r.ship;
        window.dispatchEvent(new CustomEvent('meridian:selected-shipment', { detail: { shipmentId: r.ship, routeId: r.id } }));
        setActiveHazard(null);

        var rect = mapRef.current.getBoundingClientRect();
        var cx = event.domEvent.clientX - rect.left;
        var cy = event.domEvent.clientY - rect.top;
        // Clamp so card doesn't overflow
        var cxClamped = Math.min(Math.max(cx, 140), rect.width - 140);
        var cyClamped = Math.max(cy, 200);
        setFloatCard({ route: r, x: cxClamped, y: cyClamped });
      });

      linesByRoute.current[r.id] = line;
      overlays.current.lines.push(line);

      // Vehicle marker at midpoint
      var midPt = pts[Math.floor(pts.length / 2)];
      var marker = new google.maps.Marker({
        position: midPt, map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 4.6, fillColor: col, fillOpacity: 0.95,
          strokeColor: 'rgba(238,247,255,0.82)', strokeWeight: 1,
        },
        title: r.label, zIndex: 8,
      });
      marker.addListener('click', function(event) {
        if (highlightFn.current) highlightFn.current(r.id);
        setSelectedRouteId(r.id);
        setSelectedRoute(r);
        window.__MERIDIAN_SELECTED_SHIPMENT__ = r.ship;
        window.dispatchEvent(new CustomEvent('meridian:selected-shipment', { detail: { shipmentId: r.ship, routeId: r.id } }));
        setActiveHazard(null);
        var rect = mapRef.current.getBoundingClientRect();
        setFloatCard({ route: r,
          x: Math.min(Math.max(event.domEvent.clientX - rect.left, 120), rect.width - 120),
          y: Math.max(event.domEvent.clientY - rect.top, 220),
        });
      });
      overlays.current.markers.push(marker);
    });

    // Initial highlight for default selection
    setTimeout(function() {
      if (highlightFn.current) highlightFn.current(GMAP_ROUTES[0].id);
    }, 100);

    // ── Hazard circles with ripple animation ───────────────
    GMAP_HAZARDS.forEach(function(h) {
      var col = h.risk === 'HIGH' ? '#e88a8a' : '#f1c26a';

      // Main outer ring
      var outerCircle = new google.maps.Circle({
        strokeColor: col, strokeOpacity: 0.34, strokeWeight: 1.2,
        fillColor: col, fillOpacity: 0.07,
        map: map, center:{ lat:h.lat, lng:h.lng }, radius: h.radius,
        clickable: true, zIndex: 5,
      });
      // Inner fill
      var innerCircle = new google.maps.Circle({
        strokeOpacity: 0, fillColor: col, fillOpacity: 0.12,
        map: map, center:{ lat:h.lat, lng:h.lng }, radius: h.radius * 0.42,
        clickable: true, zIndex: 5,
      });
      // Ripple ring (animated)
      var rippleCircle = new google.maps.Circle({
        strokeColor: col, strokeOpacity: 0, strokeWeight: 1.4,
        fillOpacity: 0,
        map: map, center:{ lat:h.lat, lng:h.lng }, radius: h.radius,
        clickable: false, zIndex: 4,
      });

      [outerCircle, innerCircle].forEach(function(c) {
        c.addListener('click', function() {
          setActiveHazard(h);
          setFloatCard(null);
          setSelectedRoute(null);
          setSelectedRouteId(null);
          if (highlightFn.current) highlightFn.current(null);
        });
      });
      overlays.current.circles.push(outerCircle, innerCircle, rippleCircle);

      // Ripple animation via setInterval
      var tick = 0;
      var id = setInterval(function() {
        tick = (tick + 1) % 80;
        var t = tick / 80;
        var eased = 1 - Math.pow(1 - t, 2); // ease-out
        var newRadius = h.radius * (1 + eased * 0.55);
        var opacity   = (1 - t) * 0.22;
        rippleCircle.setOptions({ radius: newRadius, strokeOpacity: opacity });
      }, 50);
      overlays.current.intervals.push(id);
    });

    // ── Map background click → dismiss float card ──────────
    map.addListener('click', function() {
      setFloatCard(null);
    });

  }, [mapsLoaded]);

  // ── Cleanup on unmount ───────────────────────────────────
  React.useEffect(function() {
    return function() {
      overlays.current.intervals.forEach(function(id) { clearInterval(id); });
      overlays.current.lines.forEach(function(l) { l.setMap(null); });
      overlays.current.circles.forEach(function(c) { c.setMap(null); });
      overlays.current.markers.forEach(function(m) { m.setMap(null); });
      overlays.current = { lines:[], circles:[], markers:[], intervals:[] };
      linesByRoute.current = {};
      mapInst.current = null;
    };
  }, []);

  // ── Layer visibility toggle ──────────────────────────────
  var toggleLayer = React.useCallback(function(key) {
    setLayers(function(prev) {
      var next = Object.assign({}, prev);
      next[key] = !prev[key];
      if (mapInst.current) {
        if (key === 'hazards')  overlays.current.circles.forEach(function(c) { c.setVisible(next.hazards); });
        if (key === 'aiRoutes') {
          overlays.current.lines.forEach(function(l) { l.setVisible(next.aiRoutes); });
          overlays.current.markers.forEach(function(m) { m.setVisible(next.aiRoutes); });
        }
      }
      return next;
    });
  }, []);

  function routeMatchesFilter(route, activeFilters) {
    if (route.type === 'rerouted') return activeFilters.rerouted;
    if (route.type === 'delayed') return activeFilters.delayed;
    if (route.risk === 'HIGH') return activeFilters.risk;
    return activeFilters.active;
  }

  var applyRouteVisibility = React.useCallback(function(activeFilters, activeLayers) {
    GMAP_ROUTES.forEach(function(r) {
      var visible = !!activeLayers.aiRoutes && routeMatchesFilter(r, activeFilters);
      var line = linesByRoute.current[r.id];
      if (line) line.setVisible(visible);
      overlays.current.markers.forEach(function(m) {
        if (m.getTitle && m.getTitle() === r.label) m.setVisible(visible);
      });
    });
  }, []);

  var toggleFilter = React.useCallback(function(key) {
    setFilters(function(prev) {
      var next = Object.assign({}, prev);
      next[key] = !prev[key];
      applyRouteVisibility(next, layers);
      return next;
    });
  }, [applyRouteVisibility, layers]);

  React.useEffect(function() {
    applyRouteVisibility(filters, layers);
  }, [filters, layers, applyRouteVisibility]);

  // ── Helpers ──────────────────────────────────────────────
  var typeLabel = function(t) { return t === 'rerouted' ? 'Rerouted' : t === 'delayed' ? 'Delayed' : 'In Transit'; };
  var typeColor = function(t) { return t === 'rerouted' ? 'var(--violet)' : t === 'delayed' ? 'var(--warn)' : 'var(--ok)'; };

  function selectRouteFromFallback(route) {
    setSelectedRouteId(route.id);
    setSelectedRoute(route);
    setActiveHazard(null);
    setFloatCard(null);
    window.__MERIDIAN_SELECTED_SHIPMENT__ = route.ship;
    window.dispatchEvent(new CustomEvent('meridian:selected-shipment', { detail: { shipmentId: route.ship, routeId: route.id } }));
    if (highlightFn.current) highlightFn.current(route.id);
  }

  // Layer defs with icons
  var layerDefs = [
    { key:'hazards',  label:'Hazard Zones',    color:'var(--alert)',  icon:'Alert'  },
    { key:'traffic',  label:'Live Traffic',    color:'var(--warn)',   icon:'Layers' },
    { key:'weather',  label:'Weather Overlay', color:'var(--violet)', icon:'Temp'   },
    { key:'aiRoutes', label:'AI Routes',       color:'var(--accent)', icon:'Route'  },
  ];

  var agentSteps = [
    { label:'Risk',         sub:'Threat assessed',   done:true,  active:false },
    { label:'Weather',      sub:'Storm tracked',     done:true,  active:false },
    { label:'Routing',      sub:'Alt routes found',  done:true,  active:false },
    { label:'Orchestrator', sub:'Awaiting approval', done:false, active:true  },
  ];

  return (
    <div className="gmap-view global-map-wrapper">

      {/* ── Map canvas ───────────────────────────────────────── */}
      <div className="gmap-canvas" ref={mapRef}>
        {mapError ? (
          <GlobalMapFallback
            routes={GMAP_ROUTES}
            hazards={GMAP_HAZARDS}
            selectedRouteId={selectedRouteId}
            error={mapError}
            onSelectRoute={selectRouteFromFallback}
            onSelectHazard={function(hazard) {
              setActiveHazard(hazard);
              setSelectedRoute(null);
              setSelectedRouteId(null);
              setFloatCard(null);
            }}
          />
        ) : !mapsLoaded && (
          <div className="gmap-loading">
            <div className="gmap-spinner"/>
            <span>Initialising Google Maps...</span>
          </div>
        )}
      </div>

      {/* ── Floating route card with action bar ───────────────── */}
      {floatCard && (
        <div className="gmap-float-card" style={{ left: floatCard.x, top: floatCard.y }}>
          <div className="gfc-header">
            <div className="gfc-id">{floatCard.route.ship}</div>
            <span className="gfc-badge" style={{color: typeColor(floatCard.route.type), borderColor: typeColor(floatCard.route.type)}}>
              {typeLabel(floatCard.route.type)}
            </span>
            <button className="btn ghost" style={{padding:'2px 5px', fontSize:10, marginLeft:'auto'}} onClick={function() { setFloatCard(null); }}>
              <Icons.X size={10}/>
            </button>
          </div>
          <div className="gfc-route">{floatCard.route.label}</div>
          <div className="gfc-grid">
            <div className="gfc-cell">
              <span className="gfc-lbl">ETA</span>
              <span className="gfc-val">APR 19 · 09:44 UTC</span>
            </div>
            <div className="gfc-cell">
              <span className="gfc-lbl">Risk</span>
              <span className="gfc-val" style={{color: riskColor(floatCard.route.risk)}}>{floatCard.route.risk}</span>
            </div>
            <div className="gfc-cell">
              <span className="gfc-lbl">Confidence</span>
              <span className="gfc-val" style={{color:'var(--ok)'}}>{floatCard.route.confidence}%</span>
            </div>
            <div className="gfc-cell">
              <span className="gfc-lbl">Progress</span>
              <span className="gfc-val">{Math.round(floatCard.route.progress * 100)}%</span>
            </div>
          </div>
          <div className="gfc-conf-bar">
            <div className="gfc-conf-fill" style={{width: floatCard.route.confidence + '%'}}/>
          </div>
          {/* Action bar - direct map control */}
          <div className="gfc-actions">
            <button className="btn primary" style={{flex:1, fontSize:10, padding:'6px 4px'}} onClick={() => { console.log('Approve reroute for', floatCard.route.ship); }}>
              <Icons.Check size={10}/> Approve
            </button>
            <button className="btn ghost" style={{flex:1, fontSize:10, padding:'6px 4px'}} onClick={() => { console.log('Simulate', floatCard.route.ship); }}>
              <Icons.Play size={10}/> Simulate
            </button>
          </div>
          <div className="gfc-arrow"/>
        </div>
      )}

      {/* ── Left: Layer Controls (compact) ───────────────────── */}
      <div className="gmap-layer-panel">
        <div className="glp-title">Global Route Monitor</div>
        <div className="glp-section-label">Overlays</div>
        {layerDefs.map(function(l) {
          var LayerIcon = Icons[l.icon];
          return (
            <label key={l.key} className={"glp-row" + (layers[l.key] ? " glp-row-active" : "")} onClick={function() { toggleLayer(l.key); }}>
              <div className="glp-icon-wrap" style={{color: layers[l.key] ? l.color : 'var(--fg-3)'}}>
                <LayerIcon size={12}/>
              </div>
              <span className="glp-label" style={{color: layers[l.key] ? 'var(--fg-0)' : 'var(--fg-2)'}}>{l.label}</span>
              <div
                className={"glp-toggle " + (layers[l.key] ? "on" : "off")}
                style={layers[l.key] ? {background: l.color, boxShadow: '0 0 8px ' + l.color} : {}}
              >
                <div className="glp-thumb"/>
              </div>
            </label>
          );
        })}
        <div className="glp-divider"/>
        <div className="glp-section-label">Filter</div>
        {[
          { key:'active', label:'Active' },
          { key:'risk', label:'At Risk' },
          { key:'delayed', label:'Delayed' },
          { key:'rerouted', label:'Rerouted' },
        ].map(function(f) {
          return (
            <label key={f.key} className={"glp-row" + (filters[f.key] ? " glp-row-active" : "")} onClick={function() { toggleFilter(f.key); }}>
              <div className={"glp-check-dot " + (filters[f.key] ? "on" : "off")} />
              <span className="glp-label" style={{color: filters[f.key] ? 'var(--fg-0)' : 'var(--fg-2)'}}>{f.label}</span>
              <span className="glp-count">
                {GMAP_ROUTES.filter(function(r) {
                  if (f.key === 'active') return r.type === 'active' && r.risk !== 'HIGH';
                  if (f.key === 'risk') return r.risk === 'HIGH';
                  if (f.key === 'delayed') return r.type === 'delayed';
                  return r.type === 'rerouted';
                }).length}
              </span>
            </label>
          );
        })}
      </div>

      {/* ── Right: AI Decision panel ─────────────────────────── */}
      <div className="gmap-ai-panel">
        <div className="gap-header">
          <div className="gap-title">AI Decision</div>
          <span className="gap-badge">Reroute Suggested</span>
        </div>

        <div className="gap-ship-ref">
          <span className="gap-ship-id">{selectedRoute ? selectedRoute.ship : 'MDR-745'}</span>
          <span className="gap-ship-route">{selectedRoute ? selectedRoute.label : 'New York → London'}</span>
          {selectedRoute && (
            <span className="gap-risk-tag" style={{color: riskColor(selectedRoute.risk), borderColor: riskColor(selectedRoute.risk)}}>
              {selectedRoute.risk}
            </span>
          )}
        </div>

        <div className="gap-conf-wrap">
          <div className="gap-conf-header">
            <span className="gap-conf-label">Confidence</span>
            <span className="gap-conf-pct">{selectedRoute ? selectedRoute.confidence : 92}%</span>
          </div>
          <div className="gap-conf-track">
            <div className="gap-conf-fill" style={{width:(selectedRoute ? selectedRoute.confidence : 92) + '%'}}/>
          </div>
        </div>

        <div className="gap-divider"/>

        <div className="gap-section-label">Key Reasons</div>
        <ul className="gap-reasons">
          <li>{selectedRoute ? selectedRoute.label : "North Atlantic corridor"} under monitored exposure</li>
          <li>{selectedRoute ? selectedRoute.ship : "MRD-745"} risk reduced via alternate arc</li>
          <li>Traffic/weather blend favors proactive reroute</li>
          <li>Confidence-backed action to minimize delay cascade</li>
        </ul>

        <div className="gap-divider"/>

        <div className="gap-section-label">Agents</div>
        <div className="gap-workflow">
          {agentSteps.map(function(a, i) {
            return (
              <React.Fragment key={a.label}>
                <div className={"gap-agent" + (a.done ? " done" : a.active ? " active" : "")}>
                  <div className="gap-agent-dot"/>
                  <div className="gap-agent-info">
                    <div className="gap-agent-name">{a.label}</div>
                    <div className="gap-agent-sub">{a.sub}</div>
                  </div>
                </div>
                {i < agentSteps.length - 1 && <div className="gap-connector"/>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Bottom: Selected Shipment card ───────────────────── */}
      {selectedRoute && (
        <div className="gmap-ship-card">
          <div className="gsc-left">
            <div className="gsc-id">{selectedRoute.ship}</div>
            <div className="gsc-route">{selectedRoute.label}</div>
          </div>
          <div className="gsc-meta">
            <div className="gsc-item">
              <span className="gsc-lbl">ETA</span>
              <span className="gsc-val">APR 19 · 09:44 UTC</span>
            </div>
            <div className="gsc-item">
              <span className="gsc-lbl">Risk</span>
              <span className="gsc-val" style={{color:riskColor(selectedRoute.risk)}}>{selectedRoute.risk}</span>
            </div>
            <div className="gsc-item">
              <span className="gsc-lbl">Cargo</span>
              <span className="gsc-val">{selectedRoute.cargo}</span>
            </div>
            <div className="gsc-item">
              <span className="gsc-lbl">Status</span>
              <span className="gsc-val" style={{color: typeColor(selectedRoute.type)}}>{typeLabel(selectedRoute.type)}</span>
            </div>
          </div>
          <div className="gsc-timeline">
            <div className="gsc-tl-label">Progress</div>
            <div className="gsc-tl-bar">
              <div className="gsc-tl-fill" style={{width: Math.round(selectedRoute.progress * 100) + '%'}}/>
              <div className="gsc-tl-dot"  style={{left:  Math.round(selectedRoute.progress * 100) + '%'}}/>
            </div>
            <div className="gsc-tl-ends">
              <span>{selectedRoute.label.split(' → ')[0]}</span>
              <span style={{color:'var(--accent)', fontFamily:'var(--font-mono)', fontSize:10}}>{Math.round(selectedRoute.progress * 100)}%</span>
              <span>{selectedRoute.label.split(' → ')[1]}</span>
            </div>
          </div>
          <button className="btn ghost gsc-close" onClick={function() {
            setSelectedRoute(null);
            setSelectedRouteId(null);
            window.__MERIDIAN_SELECTED_SHIPMENT__ = null;
            window.dispatchEvent(new CustomEvent('meridian:selected-shipment', { detail: { shipmentId: null, routeId: null } }));
            if (highlightFn.current) highlightFn.current(null);
          }}>
            <Icons.X size={12}/>
          </button>
        </div>
      )}

      {/* ── Hazard tooltip ───────────────────────────────────── */}
      {activeHazard && (
        <div className="gmap-haz-tip">
          <div className="ght-head">
            <span className="ght-icon" style={{color: activeHazard.risk==='HIGH' ? 'var(--alert)' : 'var(--warn)'}}>⚠</span>
            <div className="ght-info">
              <div className="ght-name">{activeHazard.name}</div>
              <div className="ght-status">Active Hazard Zone</div>
            </div>
            <button className="btn ghost" style={{padding:'2px 6px', fontSize:10, marginLeft:'auto'}} onClick={function() { setActiveHazard(null); }}>
              <Icons.X size={11}/>
            </button>
          </div>
          <div className="ght-grid">
            <div className="ght-cell">
              <span className="ght-lbl">Risk</span>
              <span className="ght-val" style={{color: activeHazard.risk==='HIGH' ? 'var(--alert)' : 'var(--warn)'}}>{activeHazard.risk}</span>
            </div>
            <div className="ght-cell">
              <span className="ght-lbl">Severity</span>
              <span className="ght-val">{activeHazard.severity}%</span>
            </div>
            <div className="ght-cell">
              <span className="ght-lbl">Status</span>
              <span className="ght-val" style={{color:'var(--ok)'}}>{activeHazard.status}</span>
            </div>
            <div className="ght-cell">
              <span className="ght-lbl">Impacted</span>
              <span className="ght-val">{activeHazard.impacted} Ships</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

window.GlobalMapView = GlobalMapView;
