// ============================================================
// Meridian data — shipments, routes, hazards, agent logs
// Map is a simple equirectangular projection with a 1000x500 viewBox.
// ============================================================

// ---- World landmass (hand-traced rough continents, normalized 0-1) ----
// Deliberately stylized / low-poly. Coords are [lon, lat] pairs in degrees.

const project = (lon, lat, W = 1000, H = 500) => {
  // equirectangular, centered at 0,0
  const x = (lon + 180) * (W / 360);
  const y = (90 - lat) * (H / 180);
  return [x, y];
};

// rough continent outlines (lon,lat). Not geographically precise — just vibes.
const CONTINENTS = [
  // NORTH AMERICA
  "-168,65 -158,70 -140,68 -125,60 -122,48 -124,40 -117,32 -107,25 -97,22 -90,18 -82,15 -80,25 -75,35 -72,42 -65,45 -60,48 -55,52 -60,58 -68,63 -80,62 -90,65 -105,68 -125,72 -145,70 -168,65",
  // SOUTH AMERICA
  "-80,12 -70,10 -60,8 -50,0 -40,-5 -35,-10 -40,-25 -55,-35 -70,-45 -73,-52 -70,-55 -65,-52 -60,-40 -68,-28 -78,-12 -80,-5 -80,12",
  // EUROPE
  "-10,36 0,38 10,38 18,40 28,38 35,40 40,43 35,55 28,60 20,62 10,60 4,55 -5,52 -10,45 -10,36",
  // AFRICA
  "-18,35 -8,32 0,30 15,32 25,31 33,30 36,22 44,12 50,2 45,-8 38,-18 30,-30 20,-35 10,-30 0,-22 -8,-8 -15,0 -18,12 -18,25 -18,35",
  // ASIA
  "35,68 50,70 65,72 85,75 105,77 125,73 140,65 150,55 145,45 130,38 120,30 110,22 100,15 95,8 90,22 80,28 70,30 60,25 55,30 50,40 45,45 40,55 38,60 35,68",
  // INDIA subcontinent nub (extra)
  "68,8 72,22 80,28 88,22 90,10 80,5 72,5 68,8",
  // SE ASIA
  "95,0 102,-2 110,-5 120,-8 128,-3 122,5 115,8 105,10 100,8 95,0",
  // AUSTRALIA
  "115,-12 125,-12 135,-15 145,-15 150,-22 152,-32 145,-38 135,-35 125,-32 115,-28 112,-22 115,-12",
  // JAPAN (rough)
  "130,33 135,35 140,38 142,42 140,45 135,43 132,38 130,33",
  // UK (tiny)
  "-5,50 0,52 0,58 -5,58 -8,54 -5,50",
];

const continentPaths = CONTINENTS.map(c => {
  return c.split(" ")
    .map(p => p.split(",").map(Number))
    .map(([lon, lat]) => project(lon, lat).join(","))
    .join(" ");
});

// ---- Cities / hubs ----
const CITIES = [
  { code: "LAX", name: "Los Angeles",  lon: -118.2, lat: 34.0 },
  { code: "JFK", name: "New York",     lon: -74.0,  lat: 40.7 },
  { code: "MEX", name: "Mexico City",  lon: -99.1,  lat: 19.4 },
  { code: "GRU", name: "São Paulo",    lon: -46.6,  lat: -23.5 },
  { code: "LHR", name: "London",       lon: -0.1,   lat: 51.5 },
  { code: "CDG", name: "Paris",        lon: 2.3,    lat: 48.8 },
  { code: "FRA", name: "Frankfurt",    lon: 8.7,    lat: 50.1 },
  { code: "DXB", name: "Dubai",        lon: 55.3,   lat: 25.2 },
  { code: "BOM", name: "Mumbai",       lon: 72.8,   lat: 19.0 },
  { code: "BLR", name: "Bengaluru",    lon: 77.5,   lat: 12.9 },
  { code: "SIN", name: "Singapore",    lon: 103.8,  lat: 1.3  },
  { code: "HKG", name: "Hong Kong",    lon: 114.1,  lat: 22.3 },
  { code: "PVG", name: "Shanghai",     lon: 121.4,  lat: 31.2 },
  { code: "NRT", name: "Tokyo",        lon: 140.3,  lat: 35.7 },
  { code: "SYD", name: "Sydney",       lon: 151.2,  lat: -33.8 },
  { code: "JNB", name: "Johannesburg", lon: 28.0,   lat: -26.2 },
  { code: "LOS", name: "Lagos",        lon: 3.4,    lat: 6.5  },
  { code: "IST", name: "Istanbul",     lon: 28.9,   lat: 41.0 },
  { code: "ROT", name: "Rotterdam",    lon: 4.5,    lat: 51.9 },
  { code: "ANR", name: "Antwerp",      lon: 4.4,    lat: 51.2 },
];

const cityByCode = Object.fromEntries(CITIES.map(c => [c.code, c]));
const CITY_COUNTRIES = {
  LAX: "United States",
  JFK: "United States",
  MEX: "Mexico",
  GRU: "Brazil",
  LHR: "United Kingdom",
  CDG: "France",
  FRA: "Germany",
  DXB: "United Arab Emirates",
  BOM: "India",
  BLR: "India",
  SIN: "Singapore",
  HKG: "Hong Kong",
  PVG: "China",
  NRT: "Japan",
  SYD: "Australia",
  JNB: "South Africa",
  LOS: "Nigeria",
  IST: "Turkey",
  ROT: "Netherlands",
  ANR: "Belgium",
};

const CITY_REGIONS = {
  LAX: "north-america",
  JFK: "north-america",
  MEX: "north-america",
  GRU: "south-america",
  LHR: "europe",
  CDG: "europe",
  FRA: "europe",
  DXB: "middle-east",
  BOM: "asia",
  BLR: "asia",
  SIN: "asia",
  HKG: "asia",
  PVG: "asia",
  NRT: "asia",
  SYD: "oceania",
  JNB: "africa",
  LOS: "africa",
  IST: "europe",
  ROT: "europe",
  ANR: "europe",
};

function routeDistanceKm(fromCode, toCode) {
  const fromCity = cityByCode[fromCode];
  const toCity = cityByCode[toCode];
  if (!fromCity || !toCity) return 0;

  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(toCity.lat - fromCity.lat);
  const dLon = toRad(toCity.lon - fromCity.lon);
  const lat1 = toRad(fromCity.lat);
  const lat2 = toRad(toCity.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inferTransportType(shipment) {
  const explicitType = shipment.transportType?.toLowerCase();
  if (["sea", "air", "road", "rail"].includes(explicitType)) return explicitType;

  const fromCode = shipment.from ?? shipment.fromCode;
  const toCode = shipment.to ?? shipment.toCode;
  const routeKey = `${fromCode}-${toCode}`;
  const cargo = (shipment.cargo ?? shipment.cargoDescription ?? "").toLowerCase();
  const etaText = `${shipment.etaIso ?? ""} ${shipment.etaOriginal ?? ""} ${shipment.eta?.estimatedArrival ?? ""}`.toLowerCase();
  const distanceKm = routeDistanceKm(fromCode, toCode);
  const sameRegion = CITY_REGIONS[fromCode] && CITY_REGIONS[fromCode] === CITY_REGIONS[toCode];

  if (["ROT-ANR", "ANR-ROT", "PVG-ANR", "SIN-ROT", "HKG-GRU"].includes(routeKey)) return "sea";
  if (sameRegion && distanceKm <= 2600 && CITY_REGIONS[fromCode] === "europe") return "rail";
  if (sameRegion && distanceKm <= 1600) return "road";
  if (etaText.includes("d") && !/(pharma|medical|perishable|fresh|lithium|chip|wafer)/.test(cargo)) return "sea";
  return "air";
}

function inferShipmentScopeLocation(shipment) {
  const fallbackCode = shipment.to
    ?? shipment.toCode
    ?? shipment.from
    ?? shipment.fromCode
    ?? null;
  const fallbackCity = fallbackCode ? cityByCode[fallbackCode] : null;

  return {
    country: shipment.country
      ?? shipment.destinationCountry
      ?? shipment.toCountry
      ?? shipment.originCountry
      ?? CITY_COUNTRIES[fallbackCode]
      ?? "India",
    city: shipment.city
      ?? shipment.destinationCity
      ?? shipment.toCity
      ?? shipment.originCity
      ?? fallbackCity?.name
      ?? "Mumbai",
  };
}

// ---- Great-circle-ish curve helper ----
// Produces an arc from A to B with a slight bulge.
function greatArc(a, b, bulge = 0.18, steps = 40) {
  const [x1, y1] = project(a.lon, a.lat);
  const [x2, y2] = project(b.lon, b.lat);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // perpendicular normal
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const cx = mx + nx * len * bulge;
  const cy = my + ny * len * bulge;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1-t)*(1-t)*x1 + 2*(1-t)*t*cx + t*t*x2;
    const y = (1-t)*(1-t)*y1 + 2*(1-t)*t*cy + t*t*y2;
    pts.push([x, y]);
  }
  return pts;
}

function arcPath(a, b, bulge = 0.18) {
  const pts = greatArc(a, b, bulge, 40);
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
}

function pointAt(a, b, t, bulge = 0.18) {
  const [x1, y1] = project(a.lon, a.lat);
  const [x2, y2] = project(b.lon, b.lat);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const cx = mx + nx * len * bulge;
  const cy = my + ny * len * bulge;
  const x = (1-t)*(1-t)*x1 + 2*(1-t)*t*cx + t*t*x2;
  const y = (1-t)*(1-t)*y1 + 2*(1-t)*t*cy + t*t*y2;
  return [x, y];
}

// ---- Shipments ----
const SHIPMENTS = [
  { id: "MRD-48271", cargo: "Refrigerated pharma",     weight: "12.4 t", from: "FRA", to: "BOM", progress: 0.62, status: "risk",     etaIso: "T+18h 22m", etaOriginal: "T+14h 50m", delayMin: 212, bulge: 0.16 },
  { id: "MRD-48265", cargo: "Automotive parts",        weight: "28.1 t", from: "PVG", to: "LAX", progress: 0.41, status: "transit",  etaIso: "T+32h 10m", etaOriginal: "T+32h 10m", delayMin: 0, bulge: -0.22 },
  { id: "MRD-48259", cargo: "Electronics / chips",     weight: "4.8 t",  from: "NRT", to: "JFK", progress: 0.58, status: "rerouted", etaIso: "T+19h 05m", etaOriginal: "T+23h 40m", delayMin: -275, bulge: -0.18 },
  { id: "MRD-48244", cargo: "Fresh produce",           weight: "16.2 t", from: "MEX", to: "JFK", progress: 0.84, status: "transit",  etaIso: "T+4h 12m",  etaOriginal: "T+4h 00m",  delayMin: 12, bulge: 0.1 },
  { id: "MRD-48238", cargo: "Textiles",                weight: "22.0 t", from: "SIN", to: "ROT", progress: 0.28, status: "transit",  etaIso: "T+6d 02h",  etaOriginal: "T+6d 02h",  delayMin: 0, bulge: 0.14 },
  { id: "MRD-48221", cargo: "Heavy machinery",         weight: "44.5 t", from: "DXB", to: "LOS", progress: 0.52, status: "delayed",  etaIso: "T+11h 40m", etaOriginal: "T+9h 50m",  delayMin: 110, bulge: 0.2 },
  { id: "MRD-48210", cargo: "Lithium cells",           weight: "8.3 t",  from: "BLR", to: "HKG", progress: 0.71, status: "transit",  etaIso: "T+3h 28m",  etaOriginal: "T+3h 40m",  delayMin: -12, bulge: 0.12 },
  { id: "MRD-48199", cargo: "Medical supplies",        weight: "5.1 t",  from: "IST", to: "JNB", progress: 0.46, status: "transit",  etaIso: "T+14h 02m", etaOriginal: "T+14h 02m", delayMin: 0, bulge: 0.15 },
  { id: "MRD-48184", cargo: "Apparel",                 weight: "19.8 t", from: "HKG", to: "GRU", progress: 0.22, status: "transit",  etaIso: "T+8d 14h",  etaOriginal: "T+8d 14h",  delayMin: 0, bulge: -0.2 },
  { id: "MRD-48170", cargo: "Semiconductor wafers",    weight: "2.2 t",  from: "SIN", to: "FRA", progress: 0.66, status: "transit",  etaIso: "T+21h 30m", etaOriginal: "T+21h 30m", delayMin: 0, bulge: 0.16 },
  { id: "MRD-48151", cargo: "Perishables",             weight: "13.7 t", from: "SYD", to: "LAX", progress: 0.38, status: "transit",  etaIso: "T+12h 55m", etaOriginal: "T+12h 55m", delayMin: 0, bulge: -0.14 },
  { id: "MRD-48142", cargo: "Consumer electronics",    weight: "31.2 t", from: "PVG", to: "ANR", progress: 0.55, status: "transit",  etaIso: "T+5d 03h",  etaOriginal: "T+5d 03h",  delayMin: 0, bulge: 0.18 },
];

// add computed pos + path for each
SHIPMENTS.forEach(s => {
  const a = cityByCode[s.from];
  const b = cityByCode[s.to];
  const location = inferShipmentScopeLocation(s);
  s.transportType = inferTransportType(s);
  s.country = s.country ?? location.country;
  s.city = s.city ?? location.city;
  s._path = arcPath(a, b, s.bulge);
  s._pos = pointAt(a, b, s.progress, s.bulge);
  s._origin = project(a.lon, a.lat);
  s._dest = project(b.lon, b.lat);
});

// ---- Hazard zones (polygons in projected coords) ----
const HAZARDS = [
  {
    id: "HZ-021",
    type: "Weather",
    title: "Cyclone Arwen — Arabian Sea",
    severity: "High",
    affects: ["MRD-48271", "MRD-48221"],
    // rough ellipse around 60E, 15N
    points: [
      [58, 20], [65, 22], [70, 18], [72, 12], [68, 7], [60, 6], [55, 10], [54, 16], [58, 20],
    ].map(([lon, lat]) => project(lon, lat)),
  },
  {
    id: "HZ-019",
    type: "Traffic",
    title: "Port of Rotterdam — congestion",
    severity: "Medium",
    affects: ["MRD-48238", "MRD-48142"],
    points: [
      [2, 53], [7, 53], [8, 51], [5, 50], [1, 51], [2, 53],
    ].map(([lon, lat]) => project(lon, lat)),
  },
  {
    id: "HZ-014",
    type: "Weather",
    title: "Pacific storm front — 38°N",
    severity: "Medium",
    affects: ["MRD-48259"],
    points: [
      [-170, 45], [-155, 48], [-140, 46], [-135, 40], [-145, 36], [-160, 38], [-170, 45],
    ].map(([lon, lat]) => project(lon, lat)),
  },
];

// ---- Agent reasoning log (the hero feature) ----
const REASONING = [
  {
    id: "OPT-4921",
    status: "active",
    agent: "orchestrator",
    timestamp: "14:32:08",
    title: "Reroute proposed for MRD-48271 (FRA → BOM)",
    shipmentId: "MRD-48271",
    alertId: "HZ-021",
    body: (
      "Cyclone Arwen intersects planned corridor over the Arabian Sea with 92% confidence. " +
      "Map Agent evaluated 4 alternates and selected transit via DXB with a 3°N southern offset. " +
      "Weather agent projects clearance in 14h; delay cost exceeds reroute cost by $18.2k."
    ),
    metrics: { originalETA: "T+14h 50m", proposedETA: "T+18h 22m", saved: "-3h 32m", savedBad: true },
    agents: [
      { a: "intelligence", msg: "Detected cyclone hazard HZ-021 intersecting active corridor.", done: true },
      { a: "weather", msg: "Cyclone speed 42 km/h NE; forecast landfall +14h.", done: true },
      { a: "map", msg: "Evaluated alternates: {DXB-bridge, SHJ-bridge, direct-south-38}.", done: true },
      { a: "orchestrator", msg: "Selected DXB-bridge. Calculating customs handoff…", done: false, typing: true },
    ],
  },
  {
    id: "OPT-4920",
    status: "approved",
    agent: "map",
    timestamp: "14:28:51",
    title: "Rerouted MRD-48259 around Pacific storm front",
    shipmentId: "MRD-48259",
    alertId: "HZ-014",
    body: (
      "Storm front HZ-014 blocks 38°N corridor. Map Agent selected great-circle northern track via Anchorage. " +
      "Time saved vs original ETA: 4h 35m. Auto-approved under policy RR-fresh-electronics."
    ),
    metrics: { originalETA: "T+23h 40m", proposedETA: "T+19h 05m", saved: "4h 35m", savedBad: false },
    agents: [
      { a: "intelligence", msg: "HZ-014 blocks primary Pacific corridor.", done: true },
      { a: "map", msg: "Northern arc via ANC is viable; fuel +3.1%.", done: true },
      { a: "orchestrator", msg: "Auto-approved. Notifying carrier + customer.", done: true },
    ],
  },
  {
    id: "OPT-4917",
    status: "monitoring",
    agent: "intelligence",
    timestamp: "14:19:04",
    title: "Monitoring Rotterdam congestion — 4 shipments impacted",
    shipmentId: "—",
    alertId: "HZ-019",
    body: (
      "Port dwell time risen to 38h (baseline 14h). No reroute yet — holding pattern recommended. " +
      "Will re-evaluate at 16:00 UTC based on berth queue depth."
    ),
    metrics: { originalETA: "—", proposedETA: "—", saved: "Watching", savedBad: false },
    agents: [
      { a: "intelligence", msg: "Port of Rotterdam dwell +171% vs 30d baseline.", done: true },
      { a: "orchestrator", msg: "Deferring reroute; watching berth queue.", done: true },
    ],
  },
  {
    id: "OPT-4912",
    status: "approved",
    agent: "weather",
    timestamp: "13:52:30",
    title: "ETA adjusted for MRD-48221 (DXB → LOS)",
    shipmentId: "MRD-48221",
    alertId: "HZ-021",
    body: (
      "Headwind band detected over the Gulf of Aden — Weather Agent adjusted block time by +1h 50m. No reroute necessary."
    ),
    metrics: { originalETA: "T+9h 50m", proposedETA: "T+11h 40m", saved: "-1h 50m", savedBad: true },
    agents: [
      { a: "weather", msg: "Headwind 58 km/h persists 4h+.", done: true },
      { a: "map", msg: "No safer alternate; accept delay.", done: true },
    ],
  },
];

// ---- KPIs ----
const KPIS = {
  activeShipments: 2847,
  onTime: 94.2,
  atRisk: 23,
  reroutedToday: 48,
  timeSavedHrs: 312,
  costSaved: "$1.28M",
};

// Expose globally so other Babel scripts can use them.
Object.assign(window, {
  CITIES, cityByCode, SHIPMENTS, HAZARDS, REASONING, KPIS,
  continentPaths, project, arcPath, pointAt, greatArc, inferTransportType, inferShipmentScopeLocation,
});
