export type Role = "central" | "member";
export type Proximity = "cerca" | "lejos";
export type EventStatus = "pending" | "cancelled" | "alert" | "resolved";
export type EventType = "fall" | "impact" | "struggle" | "manual" | "sos";

export type Sensors = {
  accel: number | null;
  gyro: number | null;
  proximity: Proximity | null;
  light: number | null;
  heading: number | null;
  headingAccuracy: number | null;
};

export type Zone = {
  lat: number;
  lng: number;
  radius: number;
};

export type Member = {
  userId: string;
  name: string;
  photoUrl: string | null;
  role: Role;
  protectionArmed: boolean;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  lastSeen: string | null;
  sensors: Sensors;
};

export type Home = {
  id: string;
  name: string;
  inviteCode: string | null;
  role: Role;
  protectionArmed: boolean;
  plan: "hogar" | "nube";
  planStatus: string;
  last4: string | null;
  periodEnd: string | null;
  billingMode: "prueba" | "cobro" | null;
  amount: number | null;
  authCode: string | null;
  payerName: string | null;
  mailTo: string | null;
  mailSent: boolean;
  zone: Zone | null;
  members: Member[];
};

export type User = { id: string; name: string; email: string; photoUrl: string | null };

export type AppEvent = {
  id: string;
  userId: string;
  userName: string;
  type: EventType;
  label: string;
  status: EventStatus;
  lat: number | null;
  lng: number | null;
  detail: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  hasClip: boolean;
  createdAt: string;
  updatedAt: string;
};

