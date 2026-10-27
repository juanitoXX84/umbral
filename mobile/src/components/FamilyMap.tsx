import { useEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { distanceMeters, placeOf } from "@/lib/place";
import { getServer } from "@/lib/storage";
import type { AppEvent, Member, Zone } from "@/lib/types";
import { colors, type } from "@/lib/theme";

const TILE = 256;
const BASE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const ROADS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile";
const NAMES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile";

type Spot = { lat: number; lng: number; accuracy?: number | null };

function worldPoint(lat: number, lng: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * size;
  const sine = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size;
  return { x, y };
}

function pointToLatLng(x: number, y: number, zoom: number): Spot {
  const size = TILE * 2 ** zoom;
  const lng = (x / size) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
  return { lat, lng };
}

function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function zoomFor(lat: number, radius: number, span: number) {
  const meters = (Math.max(radius, 40) * 3.4) / Math.max(span, 220);
  const zoom = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / meters);
  if (!Number.isFinite(zoom)) return 17;
  return Math.max(16, Math.min(18, Math.round(zoom)));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (`${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "·");
}

function scaleFor(lat: number, zoom: number) {
  const raw = metersPerPixel(lat, zoom) * 78;
  const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const meters = steps.find((step) => step >= raw) ?? 5000;
  return {
    px: meters / metersPerPixel(lat, zoom),
    label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
  };
}

export function FamilyMap({
  members,
  events,
  zone,
  selectedId,
  onSelect,
  placing = false,
  draft = null,
  focus = 0,
  label = "Casa",
  here = null,
  onPlace,
  height = 460,
}: {
  members: Member[];
  events: AppEvent[];
  zone: Zone | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  placing?: boolean;
  draft?: Zone | null;
  focus?: number;
  label?: string;
  here?: Spot | null;
  onPlace?: (lat: number, lng: number) => void;
  height?: number;
}) {
  const [server, setServer] = useState("");
  const [zoom, setZoom] = useState(17);
  const [center, setCenter] = useState<Spot | null>(zone ? { lat: zone.lat, lng: zone.lng } : here);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [roads, setRoads] = useState(true);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const boxRef = useRef(box);
  const moved = useRef(false);
  const fitted = useRef(false);
  const placingRef = useRef(placing);
  const onPlaceRef = useRef(onPlace);
  const origin = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  centerRef.current = center;
  zoomRef.current = zoom;
  boxRef.current = box;
  placingRef.current = placing;
  onPlaceRef.current = onPlace;

  useEffect(() => {
    getServer().then(setServer);
  }, []);

  useEffect(() => {
    moved.current = false;
  }, [focus]);

  useEffect(() => {
    if (fitted.current || !zone || box.width < 40) return;
    fitted.current = true;
    setZoom(zoomFor(zone.lat, zone.radius, Math.min(box.width, box.height)));
  }, [zone, box.width, box.height]);

  useEffect(() => {
    if (placing && draft) {
      setCenter({ lat: draft.lat, lng: draft.lng });
      return;
    }
    if (moved.current) return;
    const next = here ?? (zone ? { lat: zone.lat, lng: zone.lng } : null);
    if (!next) return;
    setCenter((current) => {
      if (!current) return next;
      if (distanceMeters(current.lat, current.lng, next.lat, next.lng) < 6) return current;
      return next;
    });
  }, [placing, draft?.lat, draft?.lng, here?.lat, here?.lng, zone?.lat, zone?.lng, focus]);

  useEffect(() => {
    if (!selectedId) return;
    const member = members.find((item) => item.userId === selectedId && item.lat != null && item.lng != null);
    if (!member || member.lat == null || member.lng == null) return;
    moved.current = true;
    setCenter({ lat: member.lat, lng: member.lng });
    setZoom((current) => Math.max(current, 18));
  }, [selectedId]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => placingRef.current,
      onMoveShouldSetPanResponder: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 3,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        pinch.current = null;
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          pinch.current = { dist, zoom: zoomRef.current };
        }
        const current = centerRef.current;
        if (!current) return;
        origin.current = worldPoint(current.lat, current.lng, zoomRef.current);
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (!pinch.current) pinch.current = { dist, zoom: zoomRef.current };
          const next = Math.round(pinch.current.zoom + Math.log2(dist / pinch.current.dist));
          const clamped = Math.min(19, Math.max(15, next));
          if (clamped !== zoomRef.current) {
            zoomRef.current = clamped;
            setZoom(clamped);
          }
          return;
        }
        const next = pointToLatLng(origin.current.x - gesture.dx, origin.current.y - gesture.dy, zoomRef.current);
        centerRef.current = next;
        setCenter(next);
      },
      onPanResponderRelease: (event, gesture) => {
        pinch.current = null;
        if (Math.hypot(gesture.dx, gesture.dy) > 8) {
          moved.current = true;
          return;
        }
        if (!placingRef.current || !onPlaceRef.current || !centerRef.current) return;
        const current = worldPoint(centerRef.current.lat, centerRef.current.lng, zoomRef.current);
        const left = Math.floor(current.x - boxRef.current.width / 2);
        const top = Math.floor(current.y - boxRef.current.height / 2);
        const spot = pointToLatLng(left + event.nativeEvent.locationX, top + event.nativeEvent.locationY, zoomRef.current);
        onPlaceRef.current(spot.lat, spot.lng);
      },
    })
  ).current;

  const alertIds = useMemo(
    () => new Set(events.filter((event) => event.status === "alert" || event.status === "pending").map((event) => event.userId)),
    [events]
  );
  const activeZone = placing && draft ? draft : zone;
  const points = members.flatMap((member) => {
    if (member.lat == null || member.lng == null) return [];
    return [{
      id: member.userId,
      name: member.name,
      photo: member.photoUrl && server ? `${server}${member.photoUrl}` : "",
      lat: member.lat,
      lng: member.lng,
      accuracy: member.accuracy,
      alert: alertIds.has(member.userId),
      armed: member.protectionArmed,
      outside: placeOf(member, activeZone) === "out",
    }];
  });

  const frameHeight = Math.max(320, height - 22);
  const world = center ? worldPoint(center.lat, center.lng, zoom) : null;
  const originX = world ? Math.floor(world.x - box.width / 2) : 0;
  const originY = world ? Math.floor(world.y - box.height / 2) : 0;
  const tiles = useMemo(() => {
    if (!world || box.width < 1 || box.height < 1) return [];
    const n = 2 ** zoom;
    const x0 = Math.floor(originX / TILE) - 1;
    const y0 = Math.floor(originY / TILE) - 1;
    const x1 = Math.floor((originX + box.width) / TILE) + 1;
    const y1 = Math.floor((originY + box.height) / TILE) + 1;
    const list: { key: string; x: number; y: number; left: number; top: number }[] = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (y < 0 || y >= n) continue;
        const wrapped = ((x % n) + n) % n;
        list.push({
          key: `${zoom}/${wrapped}/${y}`,
          x: wrapped,
          y,
          left: x * TILE - originX,
          top: y * TILE - originY,
        });
      }
    }
    return list;
  }, [originX, originY, box.width, box.height, zoom, world]);

  function screenOf(lat: number, lng: number) {
    if (!world) return null;
    const point = worldPoint(lat, lng, zoom);
    return { left: point.x - originX, top: point.y - originY };
  }

  function zoomBy(step: number) {
    const current = centerRef.current;
    if (!current) return;
    const nextZoom = Math.min(19, Math.max(15, zoomRef.current + step));
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setCenter(current);
  }

  function recenter() {
    const next = here ?? (zone ? { lat: zone.lat, lng: zone.lng } : null);
    if (!next) return;
    moved.current = false;
    setCenter(next);
    if (zone) setZoom(zoomFor(zone.lat, zone.radius, Math.min(box.width || 320, box.height || 320)));
  }

  const area = placing && draft ? draft : zone;
  const areaScreen = area ? screenOf(area.lat, area.lng) : null;
  const areaRadius = area && areaScreen ? area.radius / metersPerPixel(area.lat, zoom) : 0;
  const scale = center ? scaleFor(center.lat, zoom) : null;

  return (
    <View style={[styles.wrap, { height }]}>
      <View
        style={[styles.map, { height: frameHeight }]}
        onLayout={(event) => {
          const { width, height: nextHeight } = event.nativeEvent.layout;
          setBox({ width, height: nextHeight });
        }}
        {...pan.panHandlers}
      >
        {tiles.map((tile) => (
          <View key={tile.key} pointerEvents="none" style={[styles.tile, { left: tile.left, top: tile.top }]}>
            <Image source={{ uri: `${BASE}/${zoom}/${tile.y}/${tile.x}` }} style={styles.tileImage} />
            {roads ? (
              <Image
                source={{ uri: `${ROADS}/${zoom}/${tile.y}/${tile.x}` }}
                style={styles.overlay}
                onError={() => setRoads(false)}
              />
            ) : null}
            <Image source={{ uri: `${NAMES}/${zoom}/${tile.y}/${tile.x}` }} style={styles.overlay} />
          </View>
        ))}
        {points.map((point) => {
          const at = screenOf(point.lat, point.lng);
          if (!at || point.accuracy == null || point.accuracy < 3 || point.accuracy > 250) return null;
          const radius = point.accuracy / metersPerPixel(point.lat, zoom);
          return (
            <View
              key={`${point.id}-acc`}
              pointerEvents="none"
              style={[styles.accuracy, {
                left: at.left - radius,
                top: at.top - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
              }]}
            />
          );
        })}
        {area && areaScreen ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.circle,
                {
                  left: areaScreen.left - areaRadius,
                  top: areaScreen.top - areaRadius,
                  width: areaRadius * 2,
                  height: areaRadius * 2,
                  borderRadius: areaRadius,
                  borderStyle: placing ? "dashed" : "solid",
                },
              ]}
            />
            <View pointerEvents="none" style={[styles.anchor, { left: areaScreen.left - 5, top: areaScreen.top - 5 }]} />
            <View pointerEvents="none" style={[styles.house, { left: areaScreen.left - 74, top: areaScreen.top - 42 }]}>
              <Text style={styles.houseText} numberOfLines={1}>{label || "Casa"}</Text>
            </View>
          </>
        ) : null}
        {points.map((point) => {
          const at = screenOf(point.lat, point.lng);
          if (!at) return null;
          const selected = point.id === selectedId;
          const background = point.alert || point.outside ? colors.danger : point.armed ? colors.copper : colors.faint;
          return (
            <Pressable
              key={point.id}
              onPress={() => onSelect(point.id)}
              style={[styles.pinWrap, { left: at.left - 18, top: at.top - 38 }]}
            >
              <View style={[styles.pin, { backgroundColor: background, borderColor: selected ? colors.text : colors.bg }]}>
                {point.photo ? (
                  <Image source={{ uri: point.photo }} style={styles.photo} />
                ) : (
                  <Text style={[styles.pinText, { color: point.armed && !point.alert && !point.outside ? colors.ink : colors.text }]}>
                    {initials(point.name)}
                  </Text>
                )}
              </View>
              <View style={[styles.tip, { backgroundColor: background }]} />
            </Pressable>
          );
        })}
        {!center ? (
          <View pointerEvents="none" style={styles.waiting}>
            <Text style={styles.waitingText}>Buscando dónde está la casa</Text>
          </View>
        ) : null}
        {scale ? (
          <View pointerEvents="none" style={styles.scale}>
            <View style={[styles.scaleBar, { width: scale.px }]} />
            <Text style={styles.scaleText}>{scale.label}</Text>
          </View>
        ) : null}
        <View style={styles.tools}>
          <Pressable accessibilityRole="button" onPress={recenter} style={styles.zoomKey}>
            <Text style={styles.zoomText}>⌖</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => zoomBy(1)} style={styles.zoomKey}>
            <Text style={styles.zoomText}>+</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => zoomBy(-1)} style={styles.zoomKey}>
            <Text style={styles.zoomText}>−</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.credit}>Imagen © Esri · calles y nombres encima</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  map: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#1E1814",
    overflow: "hidden",
  },
  tile: { position: "absolute", width: TILE, height: TILE, backgroundColor: "#1E1814" },
  tileImage: { width: TILE, height: TILE },
  overlay: { position: "absolute", left: 0, top: 0, width: TILE, height: TILE },
  circle: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.copper,
    backgroundColor: "rgba(255,169,77,0.18)",
  },
  accuracy: {
    position: "absolute",
    backgroundColor: "rgba(255,169,77,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,169,77,0.7)",
  },
  anchor: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.copper,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  house: {
    position: "absolute",
    width: 148,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.copper,
    backgroundColor: "rgba(26,21,18,0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  houseText: { ...type.medium, color: colors.copper, fontSize: 13 },
  pinWrap: { position: "absolute", width: 36, height: 48, alignItems: "center" },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -2,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  photo: { width: 36, height: 36 },
  pinText: { ...type.medium, fontSize: 12 },
  waiting: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14,11,9,0.45)",
  },
  waitingText: { ...type.medium, color: colors.text, fontSize: 15 },
  scale: {
    position: "absolute",
    left: 12,
    bottom: 12,
    gap: 4,
  },
  scaleBar: {
    height: 3,
    backgroundColor: colors.text,
    borderRadius: 2,
  },
  scaleText: { ...type.medium, color: colors.text, fontSize: 11 },
  tools: { position: "absolute", top: 12, right: 12, borderRadius: 16, overflow: "hidden" },
  zoomKey: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,21,18,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  zoomText: { ...type.medium, color: colors.text, fontSize: 18 },
  credit: { ...type.body, color: colors.faint, fontSize: 12 },
});
