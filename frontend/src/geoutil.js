// Tiny geo helper for drawing direction arrows from a bearing + distance.
const METERS_PER_DEG_LAT = 111320.0;

export function offsetPoint(lat, lon, bearingDeg, distanceM) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const dlat = (distanceM * Math.cos(bearing)) / METERS_PER_DEG_LAT;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const dlon = (distanceM * Math.sin(bearing)) / metersPerDegLon;
  return [lat + dlat, lon + dlon];
}
