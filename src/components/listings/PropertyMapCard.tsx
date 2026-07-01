"use client";

// CSS pro Leaflet — musí být importováno na client side
import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Train, Bus, MapPin, AlertCircle } from "lucide-react";
import type { TransitStop } from "@/lib/golemio";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------
interface AmenitiesData {
  stops: TransitStop[];
  source: "golemio" | "mock" | "none" | "error";
  nearestMetroMinutes: number | null;
  nearestMhdMinutes: number | null;
}

export interface PropertyMapCardProps {
  listingId: string;
  lat: number;
  lng: number;
  title: string;
  addressText: string | null;
  municipality: string | null;
  metroWalkMinutes: number | null;
  mhdWalkMinutes: number | null;
}

// ---------------------------------------------------------------------------
// DivIcon factory — vyhneme se defaultním PNG ikonám Leafletu
// ---------------------------------------------------------------------------
function makeDivIcon(
  emoji: string,
  bgColor: string,
  size = 28
): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${bgColor};
      border:2px solid rgba(255,255,255,0.8);
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:${Math.round(size * 0.5)}px;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
      line-height:1;
    ">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

const PROPERTY_ICON = makeDivIcon("🏠", "#2563eb", 34);

const STOP_ICONS: Record<TransitStop["stopType"], L.DivIcon> = {
  metro: makeDivIcon("M", "#dc2626", 24),
  tram:  makeDivIcon("T", "#d97706", 22),
  bus:   makeDivIcon("B", "#16a34a", 22),
  train: makeDivIcon("🚆", "#7c3aed", 22),
};

const STOP_COLORS: Record<TransitStop["stopType"], string> = {
  metro: "#dc2626",
  tram:  "#d97706",
  bus:   "#16a34a",
  train: "#7c3aed",
};

// Jemně přesune pohled mapy pokud se center změní po mount
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15);
  }, [lat, lng, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Souhrn MHD
// ---------------------------------------------------------------------------
function MHDSummary({
  amenities,
  fallbackMetro,
  fallbackMhd,
}: {
  amenities: AmenitiesData | null;
  fallbackMetro: number | null;
  fallbackMhd: number | null;
}) {
  const metro = amenities?.nearestMetroMinutes ?? fallbackMetro;
  const mhd = amenities?.nearestMhdMinutes ?? fallbackMhd;
  const stopCount = amenities?.stops.length ?? 0;
  const isDemo = amenities?.source === "mock";

  const items: Array<{ icon: React.ReactNode; label: string; value: string }> = [
    {
      icon: <span className="text-red-400 font-bold text-sm">M</span>,
      label: "Metro",
      value: metro !== null ? `${metro} min` : "—",
    },
    {
      icon: <Train className="h-3.5 w-3.5 text-slate-400" />,
      label: "Nejbližší MHD",
      value: mhd !== null ? `${mhd} min` : "—",
    },
    {
      icon: <MapPin className="h-3.5 w-3.5 text-slate-400" />,
      label: "Zastávky do 800 m",
      value: stopCount > 0 ? String(stopCount) : "—",
    },
  ];

  return (
    <div className="mt-3 flex items-center gap-6 flex-wrap">
      {items.map(({ icon, label, value }) => (
        <div key={label} className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs text-slate-500">{label}:</span>
          <span className="text-xs font-semibold text-white">{value}</span>
        </div>
      ))}
      {isDemo && (
        <span className="text-[10px] text-slate-600 ml-auto">
          (demo data — přidejte GOLEMIO_API_KEY pro reálné zastávky)
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hlavní komponenta
// ---------------------------------------------------------------------------
export default function PropertyMapCard({
  listingId,
  lat,
  lng,
  title,
  addressText,
  municipality,
  metroWalkMinutes,
  mhdWalkMinutes,
}: PropertyMapCardProps) {
  const [amenities, setAmenities] = useState<AmenitiesData | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    fetch(`/api/listings/${listingId}/amenities`)
      .then((r) => r.json())
      .then((data: AmenitiesData) => setAmenities(data))
      .catch(() => setLoadErr(true));
  }, [listingId]);

  const stops = amenities?.stops ?? [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Nadpis */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-400" />
          Karta nemovitosti s mapou
        </h2>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-600" /> Metro</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Tramvaj</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-600" /> Bus</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-blue-600" /> Nemovitost</span>
        </div>
      </div>

      {/* Mapa */}
      <div className="relative" style={{ height: "360px" }}>
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
          attributionControl={true}
        >
          {/* CartoDB Dark Matter — pasuje k dark UI */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
          />

          <MapRecenter lat={lat} lng={lng} />

          {/* Kruh 500 m */}
          <Circle
            center={[lat, lng]}
            radius={500}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.07,
              weight: 1.5,
              dashArray: "5, 5",
            }}
          />

          {/* Marker nemovitosti */}
          <Marker position={[lat, lng]} icon={PROPERTY_ICON}>
            <Popup>
              <div className="text-sm font-medium">{title}</div>
              {(addressText ?? municipality) && (
                <div className="text-xs text-gray-600 mt-1">
                  {addressText ?? municipality}
                </div>
              )}
            </Popup>
          </Marker>

          {/* Zastávky MHD */}
          {stops.map((stop, i) => (
            <Marker
              key={`${stop.name}-${i}`}
              position={[stop.lat, stop.lng]}
              icon={STOP_ICONS[stop.stopType]}
            >
              <Popup>
                <div className="text-sm font-medium">{stop.name}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {stop.stopType.charAt(0).toUpperCase() + stop.stopType.slice(1)} ·{" "}
                  {stop.walkMinutes} min chůze ·{" "}
                  {Math.round(stop.distanceMeters)} m
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Chybová zpráva při načítání zastávek */}
        {loadErr && (
          <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 bg-slate-900/90 text-amber-400 text-xs px-2.5 py-1.5 rounded-lg border border-amber-800">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Data zastávek nedostupná
          </div>
        )}
      </div>

      {/* Souhrn dostupnosti */}
      <div className="px-5 py-3 border-t border-slate-800">
        <MHDSummary
          amenities={amenities}
          fallbackMetro={metroWalkMinutes}
          fallbackMhd={mhdWalkMinutes}
        />
      </div>
    </div>
  );
}
