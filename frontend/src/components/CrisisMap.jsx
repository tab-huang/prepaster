import { useEffect, useRef } from "react";
import L from "leaflet";
import { offsetPoint } from "../geoutil.js";

// One calm map for all four hazards. Draws as soon as module data is available -
// it does not wait for the AI. Layers vary by hazard.

// The single brand green (mirrors --accent in styles.css): "safe / go / high ground".
// Every green the map draws routes through this so the whole app shares one green.
const SAFE = "#1f7a4d";

function divIcon(html, className) {
  return L.divIcon({ html, className, iconSize: [24, 24], iconAnchor: [12, 12] });
}
function emojiIcon(emoji, label) {
  return L.divIcon({
    html: `<span class="m-emoji" title="${label}">${emoji}</span>`,
    className: "m-icon-emoji",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}
// User marker carries a translucent "facing" cone behind the dot. The cone is
// hidden (opacity 0) until the device reports a compass heading; we rotate it via
// the DOM rather than recreating the marker, so heading updates stay cheap.
const USER_ICON = L.divIcon({
  html: '<div class="m-user-wrap"><div class="m-user-cone"></div><div class="m-user"></div></div>',
  className: "m-icon",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const DEST_ICON = divIcon('<div class="m-dest"></div>', "m-icon");
const SUPPLY_ICON = emojiIcon("🛍️", "Supplies");
const SAFE_ICON = emojiIcon("🏠", "Safe building");
const FIRE_ICON = emojiIcon("🔥", "Active fire");
const OPEN_ICON = emojiIcon("🌳", "Park / open space");

export default function CrisisMap({ user, hazardType, polygon, moduleData, recommendation }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const headingRef = useRef(null); // latest compass heading, deg clockwise from north

  // Rotate the facing cone on the live user marker. Kept ref-driven (no React
  // state) because orientation events fire many times a second.
  function applyHeading(h) {
    const el = userMarkerRef.current?._icon;
    const cone = el?.querySelector(".m-user-cone");
    if (!cone) return;
    if (h == null || Number.isNaN(h)) {
      cone.style.opacity = "0";
      return;
    }
    cone.style.opacity = "1";
    cone.style.transform = `translate(-50%, -100%) rotate(${h}deg)`;
  }

  // Listen for device orientation and feed the facing cone. iOS needs an explicit
  // permission grant from a user gesture; Android/Chrome attach directly. If the
  // sensor or permission is unavailable, the cone simply never appears.
  useEffect(() => {
    let active = true;
    let last = 0;
    function onOrient(e) {
      if (!active) return;
      let h = null;
      if (typeof e.webkitCompassHeading === "number") {
        h = e.webkitCompassHeading; // iOS: already clockwise from north
      } else if (e.alpha != null) {
        h = 360 - e.alpha; // standard: alpha is counterclockwise
      }
      if (h == null || Number.isNaN(h)) return;
      const screenAngle =
        window.screen?.orientation?.angle ?? window.orientation ?? 0;
      h = (((h + screenAngle) % 360) + 360) % 360;
      const now = Date.now();
      if (now - last < 80) return; // throttle to ~12/s
      last = now;
      headingRef.current = h;
      applyHeading(h);
    }
    function attach() {
      window.addEventListener("deviceorientationabsolute", onOrient, true);
      window.addEventListener("deviceorientation", onOrient, true);
    }
    const needsPerm =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function";
    let gesture = null;
    if (needsPerm) {
      gesture = () => {
        DeviceOrientationEvent.requestPermission()
          .then((res) => { if (res === "granted") attach(); })
          .catch(() => {});
        window.removeEventListener("click", gesture);
        window.removeEventListener("touchend", gesture);
      };
      window.addEventListener("click", gesture);
      window.addEventListener("touchend", gesture);
    } else {
      attach();
    }
    return () => {
      active = false;
      window.removeEventListener("deviceorientationabsolute", onOrient, true);
      window.removeEventListener("deviceorientation", onOrient, true);
      if (gesture) {
        window.removeEventListener("click", gesture);
        window.removeEventListener("touchend", gesture);
      }
    };
  }, []);

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;
    const map = L.map(mapEl.current, { zoomControl: true });

    // Recent satellite imagery (Esri World Imagery), terrain contours (OpenTopoMap),
    // and plain streets (OSM). Satellite + a place-label overlay is the default so the
    // real terrain around the user is visible.
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }
    );
    const labels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, pane: "overlayPane", opacity: 0.9 }
    );
    const terrain = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap",
    });
    const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });

    const satelliteGroup = L.layerGroup([satellite, labels]);
    satelliteGroup.addTo(map);

    // Elevation relief overlay (semi-transparent hillshade), toggleable.
    const hillshade = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, opacity: 0.35, attribution: "Hillshade © Esri" }
    );

    const topoContours = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      opacity: 0.45,
      attribution: "© OpenTopoMap (CC-BY-SA)",
    });

    L.control
      .layers(
        { Satellite: satelliteGroup, "Terrain (topo)": terrain, Streets: streets },
        { "Elevation relief": hillshade, "Topo contours": topoContours },
        { position: "topright", collapsed: true }
      )
      .addTo(map);

    // ~20 km diameter starting view.
    map.setView([user.lat, user.lon], 12);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
  }, [user.lat, user.lon]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const bounds = [];
    const data = moduleData?.data || {};

    // Danger polygon ([lon,lat] -> [lat,lon]). Drawn for context but NOT used to
    // drive the zoom (it can be large and would zoom the map way out).
    if (polygon && polygon.length >= 3) {
      const latlngs = polygon.map(([lon, lat]) => [lat, lon]);
      L.polygon(latlngs, {
        color: "#c0392b",
        weight: 1.5,
        fillColor: "#c0392b",
        fillOpacity: 0.1,
      }).addTo(group);
    }

    // Elevation overlay: the sampled ring points, colored by height gain over the
    // user (greener = higher / safer for floods, redder = lower).
    const samples = data.elevation?.samples || [];
    samples.forEach((s) => {
      // One green for "higher than you" (the brand green), its intensity carrying
      // magnitude via opacity; gray = level; orange/red = lower / danger.
      let color = "#9aa0a6"; // ~level
      let fill = 0.85;
      if (s.gain >= 10) { color = SAFE; }
      else if (s.gain >= 5) { color = SAFE; fill = 0.5; }
      else if (s.gain <= -5) color = "#c0392b";
      else if (s.gain < 0) color = "#e08a4a";
      L.circleMarker([s.lat, s.lon], {
        radius: 6,
        color: "#fff",
        weight: 1,
        fillColor: color,
        fillOpacity: fill,
      })
        .bindPopup(`Elevation ${s.elevation} m (${s.gain >= 0 ? "+" : ""}${s.gain} m vs you)`)
        .addTo(group);
    });

    // Fires (wildfire).
    (data.fires || []).forEach((f) => {
      L.marker([f.lat, f.lon], { icon: FIRE_ICON })
        .bindPopup(`Active fire · ${f.distance_m} m away`)
        .addTo(group);
      bounds.push([f.lat, f.lon]);
    });

    // Wind arrow (wildfire) - shows where the fire is being pushed.
    if (data.wind?.ok && data.wind.toward_deg != null) {
      const to = offsetPoint(user.lat, user.lon, data.wind.toward_deg, 500);
      L.polyline([[user.lat, user.lon], to], {
        color: "#d6a13a",
        weight: 2,
        dashArray: "2 6",
        opacity: 0.8,
      })
        .bindPopup(`Wind pushing fire toward ${data.wind.toward_compass}`)
        .addTo(group);
    }

    // Safe-building candidates (dimmed context).
    (data.places?.safe || []).forEach((p) => {
      L.marker([p.lat, p.lon], { icon: SAFE_ICON, opacity: 0.5 })
        .bindPopup(`${p.name}<br/>${p.kind} · ${p.distance_m} m ${p.direction}`)
        .addTo(group);
    });

    // Open spaces (earthquake) - dimmed except the chosen one.
    (data.openSpaces || []).forEach((p) => {
      L.marker([p.lat, p.lon], { icon: OPEN_ICON, opacity: 0.55 })
        .bindPopup(`${p.name}<br/>open ground · ${p.distance_m} m ${p.direction}`)
        .addTo(group);
    });

    // Provisional direction arrow before the AI returns (routing only).
    if (!recommendation) {
      const hgv = data.elevation?.highGroundVector;
      const ev = data.escapeVector;
      const vec = hgv || ev;
      if (vec) {
        L.polyline([[user.lat, user.lon], [vec.lat, vec.lon]], {
          color: SAFE,
          weight: 3,
          dashArray: "6 8",
          opacity: 0.7,
        }).addTo(group);
        bounds.push([vec.lat, vec.lon]);
      }
    }

    // Chosen destination + path. Draw a dashed placeholder immediately, then replace
    // with the real road route from OSRM once the async fetch resolves.
    let routeCancelled = false;
    if (recommendation?.dest_lat != null) {
      const dest = [recommendation.dest_lat, recommendation.dest_lon];
      bounds.push(dest);

      // Destination pin - stays regardless of route fetch outcome.
      L.marker(dest, { icon: DEST_ICON })
        .bindPopup(`<b>${recommendation.destination_name || "Destination"}</b>${recommendation.distance ? "<br/>" + recommendation.distance : ""}`)
        .addTo(group);

      // Dashed placeholder while route loads.
      const placeholder = L.polyline([[user.lat, user.lon], dest], {
        color: SAFE, weight: 3, opacity: 0.45, dashArray: "5 8",
      }).addTo(group);

      const drawStraight = () => {
        if (routeCancelled) return;
        group.removeLayer(placeholder);
        L.polyline([[user.lat, user.lon], dest], {
          color: SAFE, weight: 5, opacity: 0.9,
        }).addTo(group);
      };

      fetch(
        `https://router.project-osrm.org/route/v1/driving/` +
        `${user.lon},${user.lat};${recommendation.dest_lon},${recommendation.dest_lat}` +
        `?overview=full&geometries=geojson`
      )
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (routeCancelled || !mapRef.current) return;
          group.removeLayer(placeholder);
          const route = data?.routes?.[0]?.geometry?.coordinates;
          if (route && route.length >= 2) {
            L.polyline(route.map(([ln, la]) => [la, ln]), {
              color: SAFE, weight: 5, opacity: 0.9,
            }).addTo(group);
          } else {
            drawStraight();
          }
        })
        .catch(drawStraight);
    }

    // Nearest supply stop (flood).
    const supply = (data.places?.supplies || [])[0];
    if (supply && hazardType === "flood") {
      L.marker([supply.lat, supply.lon], { icon: SUPPLY_ICON })
        .bindPopup(`${supply.name}<br/>${supply.kind} · ${supply.distance_m} m`)
        .addTo(group);
      bounds.push([supply.lat, supply.lon]);
    }

    // User marker last (on top). For shelter hazards with no destination, ring it.
    const shelterInPlace =
      moduleData?.pattern === "shelter" && recommendation && recommendation.dest_lat == null;
    if (shelterInPlace) {
      L.circle([user.lat, user.lon], { radius: 60, color: "#2f6fb0", weight: 2, fillOpacity: 0.08 }).addTo(group);
    }
    const userMarker = L.marker([user.lat, user.lon], { icon: USER_ICON })
      .bindPopup("You are here")
      .addTo(group);
    userMarkerRef.current = userMarker;
    applyHeading(headingRef.current); // restore facing after marker recreate
    bounds.push([user.lat, user.lon]);

    // Fit to the action-relevant points only, capped so it starts ~20 km wide and
    // never zooms in tighter than a neighborhood view.
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else {
      map.setView([user.lat, user.lon], 12);
    }

    return () => { routeCancelled = true; };
  }, [polygon, moduleData, recommendation, hazardType, user.lat, user.lon]);

  return (
    <div className="map-wrap">
      <div ref={mapEl} className="map" />
      <div className="map-compass" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="23" fill="rgba(255,255,255,0.92)" stroke="#dcdcd8" strokeWidth="1"/>
          {/* North - red */}
          <polygon points="24,5 21,24 24,20 27,24" fill="#9f2f2d"/>
          {/* South - grey */}
          <polygon points="24,43 21,24 24,28 27,24" fill="#b0b0ab"/>
          {/* East */}
          <polygon points="43,24 24,21 28,24 24,27" fill="#b0b0ab"/>
          {/* West */}
          <polygon points="5,24 24,21 20,24 24,27" fill="#b0b0ab"/>
          {/* Centre dot */}
          <circle cx="24" cy="24" r="2.5" fill="#1a1a1a"/>
          {/* Cardinal labels */}
          <text x="24" y="13" textAnchor="middle" fontSize="7" fontWeight="700" fill="#9f2f2d" fontFamily="system-ui, sans-serif">N</text>
          <text x="24" y="44" textAnchor="middle" fontSize="6" fill="#787774" fontFamily="system-ui, sans-serif">S</text>
          <text x="41" y="27" textAnchor="middle" fontSize="6" fill="#787774" fontFamily="system-ui, sans-serif">E</text>
          <text x="7"  y="27" textAnchor="middle" fontSize="6" fill="#787774" fontFamily="system-ui, sans-serif">W</text>
        </svg>
      </div>
    </div>
  );
}
