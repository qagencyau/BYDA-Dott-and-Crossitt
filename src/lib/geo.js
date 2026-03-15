const METERS_PER_DEGREE_LAT = 111_320;

export function computeBbox(points) {
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);

  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

export function createBufferedSquare(point, meters) {
  const latDelta = meters / METERS_PER_DEGREE_LAT;
  const cosLat = Math.cos((point.lat * Math.PI) / 180);
  const metersPerDegreeLng = Math.max(METERS_PER_DEGREE_LAT * cosLat, 1);
  const lngDelta = meters / metersPerDegreeLng;

  const ring = [
    [point.lng - lngDelta, point.lat - latDelta],
    [point.lng + lngDelta, point.lat - latDelta],
    [point.lng + lngDelta, point.lat + latDelta],
    [point.lng - lngDelta, point.lat + latDelta],
    [point.lng - lngDelta, point.lat - latDelta],
  ];

  return {
    type: "Polygon",
    coordinates: [ring],
    bbox: computeBbox(ring),
  };
}

export function polygonFromArcGisRings(rings) {
  if (!rings.length || !rings[0].length) {
    return null;
  }

  const firstRing = rings[0].map(([lng, lat]) => [lng, lat]);
  const isClosed =
    firstRing.length > 1 &&
    firstRing[0][0] === firstRing[firstRing.length - 1][0] &&
    firstRing[0][1] === firstRing[firstRing.length - 1][1];

  const ring = isClosed ? firstRing : [...firstRing, firstRing[0]];

  return {
    type: "Polygon",
    coordinates: [ring],
    bbox: computeBbox(ring),
  };
}
