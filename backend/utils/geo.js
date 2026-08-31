const EARTH_RADIUS_KM = 6371;
const DEFAULT_SPEED_KMH = 45;

// Demo destinations for the project's four logical distribution zones.
// They are software-only reference points so the existing simulated GPS
// workflow can calculate meaningful distances without a map API or hardware.
const REGION_DESTINATIONS = {
  "North Zone": { lat: 28.6139, lng: 77.2090, label: "North Zone Hub" },
  "South Zone": { lat: 13.0827, lng: 80.2707, label: "South Zone Hub" },
  "East Zone": { lat: 22.5726, lng: 88.3639, label: "East Zone Hub" },
  "West Zone": { lat: 19.0760, lng: 72.8777, label: "West Zone Hub" },
};

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineDistance(pointA, pointB) {
  if (!pointA || !pointB || pointA.lat == null || pointA.lng == null || pointB.lat == null || pointB.lng == null) {
    return 0;
  }
  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLng = toRadians(pointB.lng - pointA.lng);
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function speedBetween(pointA, pointB) {
  if (!pointA || !pointB) return null;
  const elapsedHours = (new Date(pointB.timestamp) - new Date(pointA.timestamp)) / 3600000;
  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) return null;
  if (elapsedHours < 1 / 60) return null; // less than one minute: simulated clicks are too close to timewise to infer speed
  const distanceKm = haversineDistance(pointA, pointB);
  return distanceKm / elapsedHours;
}

function getDestinationForRequest(request) {
  if (request.destination && request.destination.lat != null && request.destination.lng != null) {
    return {
      lat: Number(request.destination.lat),
      lng: Number(request.destination.lng),
      label: request.destination.label || "Destination",
    };
  }
  return REGION_DESTINATIONS[request.region] || REGION_DESTINATIONS["South Zone"];
}

function calculateShipmentTracking(request) {
  const gpsLog = Array.isArray(request.gpsLog) ? request.gpsLog.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
  const destination = getDestinationForRequest(request);
  const origin = gpsLog[0] || null;
  const latest = gpsLog[gpsLog.length - 1] || null;

  let travelledKm = 0;
  let calculatedSpeedSamples = [];
  for (let i = 1; i < gpsLog.length; i++) {
    travelledKm += haversineDistance(gpsLog[i - 1], gpsLog[i]);
    const speed = speedBetween(gpsLog[i - 1], gpsLog[i]);
    if (speed != null && Number.isFinite(speed) && speed > 0 && speed < 150) calculatedSpeedSamples.push(speed);
  }

  const remainingKm = latest ? haversineDistance(latest, destination) : origin ? haversineDistance(origin, destination) : 0;
  const directDistanceKm = origin ? haversineDistance(origin, destination) : 0;
  const averageSpeedKmh = calculatedSpeedSamples.length
    ? calculatedSpeedSamples.reduce((sum, speed) => sum + speed, 0) / calculatedSpeedSamples.length
    : DEFAULT_SPEED_KMH;

  const etaHours = averageSpeedKmh > 0 ? remainingKm / averageSpeedKmh : null;
  const etaAt = etaHours != null && latest
    ? new Date(new Date(latest.timestamp).getTime() + etaHours * 3600000).toISOString()
    : null;

  const progressPercent = directDistanceKm > 0
    ? Math.max(0, Math.min(100, ((directDistanceKm - remainingKm) / directDistanceKm) * 100))
    : 0;

  return {
    requestId: request.id,
    status: request.status,
    origin,
    latest,
    destination,
    directDistanceKm: Number(directDistanceKm.toFixed(2)),
    travelledKm: Number(travelledKm.toFixed(2)),
    remainingKm: Number(remainingKm.toFixed(2)),
    averageSpeedKmh: Number(averageSpeedKmh.toFixed(1)),
    etaMinutes: etaHours == null ? null : Math.max(0, Math.round(etaHours * 60)),
    etaAt,
    progressPercent: Number(progressPercent.toFixed(1)),
    gpsPoints: gpsLog.length,
    speedSource: calculatedSpeedSamples.length ? "calculated from GPS timestamps" : "default simulated transit speed",
  };
}

function enrichGpsPing(request, ping) {
  const previous = request.gpsLog[request.gpsLog.length - 1] || null;
  const segmentDistanceKm = previous ? haversineDistance(previous, ping) : 0;
  const segmentSpeedKmh = previous ? speedBetween(previous, ping) : null;

  const tracking = calculateShipmentTracking({ ...request, gpsLog: [...request.gpsLog, ping] });
  return {
    ...ping,
    distanceFromPreviousKm: Number(segmentDistanceKm.toFixed(2)),
    speedKmh: segmentSpeedKmh == null ? null : Number(segmentSpeedKmh.toFixed(1)),
    totalDistanceKm: tracking.travelledKm,
    remainingDistanceKm: tracking.remainingKm,
    etaAt: tracking.etaAt,
  };
}

module.exports = {
  DEFAULT_SPEED_KMH,
  REGION_DESTINATIONS,
  haversineDistance,
  calculateShipmentTracking,
  enrichGpsPing,
};
