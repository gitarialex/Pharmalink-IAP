import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const NAIROBI_CENTER = [-1.2864, 36.8172];

function colorFor(quantity) {
  if (quantity <= 0) return "#b42318"; // out
  if (quantity < 10) return "#b7791f"; // low
  return "#15803d"; // good
}

function pinIcon(color) {
  return L.divIcon({
    className: "map-pin",
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 14]
  });
}

export default function MapView({ results }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true
    }).setView(NAIROBI_CENTER, 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors"
    }).addTo(mapRef.current);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const plottable = (results || []).filter(
      (item) => typeof item.latitude === "number" || !Number.isNaN(Number(item.latitude))
    );

    plottable.forEach((item) => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      const marker = L.marker([lat, lng], { icon: pinIcon(colorFor(item.quantity)) })
        .addTo(map)
        .bindPopup(
          `<strong>${item.name}</strong><br/>${item.area}<br/>${item.medicine}: ${item.quantity} in stock<br/>KSh ${item.price}`
        );
      markersRef.current.push(marker);
    });

    if (plottable.length > 0) {
      const bounds = L.latLngBounds(plottable.map((item) => [Number(item.latitude), Number(item.longitude)]));
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
    } else {
      map.setView(NAIROBI_CENTER, 12);
    }
  }, [results]);

  return <div ref={containerRef} className="leaflet-embed" />;
}
