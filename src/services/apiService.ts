import { Room, RoomStatus, Lease, BookingReceipt, AppSettings, LeaseStatus, Facility, JuristicServiceItem } from '../types';
import { DEFAULT_SETTINGS, INITIAL_FACILITIES, INITIAL_JURISTIC_SERVICES } from '../mockData';

const STORAGE_KEYS = {
  ROOMS: 'bh_ram60_rooms_v2',
  LEASES: 'bh_ram60_leases_v1',
  BOOKINGS: 'bh_ram60_bookings_v1',
  SETTINGS: 'bh_ram60_settings_v1',
  FACILITIES: 'bh_ram60_facilities_v1',
  SERVICES: 'bh_ram60_services_v1',
  DELETED_IDS: 'bh_ram60_deleted_ids_v1',
};

// Calculate days remaining and update status
export function calculateLeaseDaysAndStatus(endDateStr: string): { daysRemaining: number; status: LeaseStatus } {
  if (!endDateStr) return { daysRemaining: 0, status: 'active' };
  
  const end = new Date(endDateStr);
  const now = new Date();
  // reset time to midnight for fair day comparison
  end.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  
  const diffTime = end.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let status: LeaseStatus = 'active';
  if (daysRemaining < 0) {
    status = 'expired';
  } else if (daysRemaining <= 30) {
    status = 'expiring_30';
  } else if (daysRemaining <= 60) {
    status = 'expiring_60';
  } else {
    status = 'active';
  }
  
  return { daysRemaining, status };
}

// Generate direct official LINE URL (supports @ official accounts)
export function getLineUrl(lineId?: string): string {
  const clean = (lineId || '@052adooe').trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  const id = clean.startsWith('@') ? clean : `@${clean}`;
  return `https://line.me/R/ti/p/${encodeURIComponent(id)}`;
}

// -----------------------------------------------------------------------------
// Local Storage Operations
// -----------------------------------------------------------------------------

// List of known sample Unsplash mock images used originally
const MOCK_IMAGE_DOMAINS = [
  'images.unsplash.com/photo-1545324418-cc1a3fa10c00',
  'images.unsplash.com/photo-1576013551627-0cc20b96c2a7',
  'images.unsplash.com/photo-1600585154340-be6161a56a0c',
  'images.unsplash.com/photo-1512917774080-9991f1c4c750',
  'images.unsplash.com/photo-1508873696983-2df5703bc20d',
  'images.unsplash.com/photo-1584132967334-10e028bd69f7',
  'images.unsplash.com/photo-1540555700478-4be289fbecef',
  'images.unsplash.com/photo-1534438327276-14e5300c3a48',
  'images.unsplash.com/photo-1540497077202-7c8a3999166f',
  'images.unsplash.com/photo-1518611012118-696072aa579a',
  'images.unsplash.com/photo-1513694203232-719a280e022f',
  'images.unsplash.com/photo-1507652313519-d4e9174996dd',
  'images.unsplash.com/photo-1582719478250-c89cae4dc85b',
  'images.unsplash.com/photo-1557597774-9d273605dfa9',
  'images.unsplash.com/photo-1584622650111-993a426fbf0a',
  'images.unsplash.com/photo-1506521781263-d8422e82f27a',
  'images.unsplash.com/photo-1590674899484-d5640e854abe'
];

function isMockImage(url?: string): boolean {
  if (!url) return false;
  return url.includes('images.unsplash.com') || MOCK_IMAGE_DOMAINS.some(pattern => url.includes(pattern));
}

/**
 * แปลง URL ของรูปภาพ Google Drive (ทั้ง /file/d/..., open?id=..., uc?id=..., thumbnail?id=...)
 * ให้กลายเป็น Direct Image CDN URL (https://lh3.googleusercontent.com/d/FILE_ID)
 * ที่สามารถเปิดและแสดงผลในแท็ก <img> ได้อย่างรวดเร็วและเปิดข้ามเบราว์เซอร์ได้ 100% โดยไม่ต้องล็อกอิน
 */
export function toDirectImageUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                     trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                     trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);

  if (driveMatch && driveMatch[1] && (trimmed.includes('drive.google.com') || trimmed.includes('googleusercontent.com') || trimmed.includes('google.com'))) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  return trimmed;
}

// In-memory fallback cache to ensure real-time persistence across component cycles
const memoryStorageCache: Record<string, string> = {};

function safeSetItem(key: string, value: any): void {
  try {
    const stringified = typeof value === 'string' ? value : JSON.stringify(value);
    memoryStorageCache[key] = stringified;
    localStorage.setItem(key, stringified);
    // Also mirror to sessionStorage
    try {
      sessionStorage.setItem(key, stringified);
    } catch {
      // Ignore sessionStorage errors
    }
  } catch (err: any) {
    console.warn(`LocalStorage quota exceeded or error for key ${key}:`, err);
    try {
      const stringified = typeof value === 'string' ? value : JSON.stringify(value);
      memoryStorageCache[key] = stringified;
      sessionStorage.setItem(key, stringified);
    } catch (e) {
      console.error(`SessionStorage error for key ${key}:`, e);
    }
  }
}

function safeGetItem(key: string): string | null {
  // First check memory cache
  if (memoryStorageCache[key]) {
    return memoryStorageCache[key];
  }
  try {
    const fromSession = sessionStorage.getItem(key);
    const fromLocal = localStorage.getItem(key);
    // If session has it, compare length or preference
    if (fromLocal !== null) {
      memoryStorageCache[key] = fromLocal;
      return fromLocal;
    }
    if (fromSession !== null) {
      memoryStorageCache[key] = fromSession;
      return fromSession;
    }
  } catch (err) {
    console.warn(`Error reading key ${key} from storage:`, err);
  }
  return null;
}

export function loadSettings(): AppSettings {
  const saved = safeGetItem(STORAGE_KEYS.SETTINGS);
  if (!saved) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;

    const clean = (val: any) => (val !== undefined && val !== null ? String(val).trim() : '');

    const merged: AppSettings = {
      googleWebAppUrl: parsed.googleWebAppUrl || DEFAULT_SETTINGS.googleWebAppUrl,
      agencyName: clean(parsed.agencyName) || DEFAULT_SETTINGS.agencyName,
      defaultContactPhone: clean(parsed.defaultContactPhone) || DEFAULT_SETTINGS.defaultContactPhone,
      defaultContactLine: clean(parsed.defaultContactLine) || DEFAULT_SETTINGS.defaultContactLine,
      agencyAddress: clean(parsed.agencyAddress) || DEFAULT_SETTINGS.agencyAddress,
      adminEmail: clean(parsed.adminEmail) || DEFAULT_SETTINGS.adminEmail,
      adminPassword: clean(parsed.adminPassword) || DEFAULT_SETTINGS.adminPassword,
      heroBackgroundImages: Array.isArray(parsed.heroBackgroundImages)
        ? parsed.heroBackgroundImages.filter((img: string) => !isMockImage(img))
        : [],
      updatedAt: parsed.updatedAt || ''
    };

    return merged;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  safeSetItem(STORAGE_KEYS.SETTINGS, settings);
}

/**
 * Universal Timestamp Parser for reliable comparison
 */
export function parseTimestamp(dateVal?: string | number | Date | null): number {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return isNaN(dateVal) ? 0 : dateVal;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? 0 : dateVal.getTime();
  
  const str = String(dateVal).trim();
  if (!str) return 0;
  
  // If numeric string (e.g. milliseconds timestamp)
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return isNaN(num) ? 0 : (str.length === 10 ? num * 1000 : num);
  }
  
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return parsed;
  
  // Handle DD/MM/YYYY or YYYY-MM-DD formats (common in Google Sheets & Thai locale)
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const [, d, m, y, h = '0', min = '0', s = '0'] = dmyMatch;
    let year = Number(y);
    if (year > 2400) year -= 543; // Thai Buddhist Era conversion (e.g. 2567 -> 2024)
    const date = new Date(year, Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
    if (!isNaN(date.getTime())) return date.getTime();
  }
  
  return 0;
}

/**
 * Helper to get the effective timestamp of an entity
 */
export function getEntityTimestamp(entity?: { updatedAt?: string; createdAt?: string } | null): number {
  if (!entity) return 0;
  const up = parseTimestamp(entity.updatedAt);
  if (up > 0) return up;
  return parseTimestamp(entity.createdAt);
}

/**
 * Track locally deleted entity IDs to prevent zombie resurrection during cloud sync
 */
export function recordDeletedEntityId(id: string): void {
  if (!id) return;
  try {
    const raw = safeGetItem(STORAGE_KEYS.DELETED_IDS);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[id] = Date.now();
    // Prune entries older than 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pruned: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'number' && v > weekAgo) {
        pruned[k] = v;
      }
    }
    safeSetItem(STORAGE_KEYS.DELETED_IDS, pruned);
  } catch (e) {
    console.warn('Error recording deleted ID:', e);
  }
}

export function isEntityDeletedLocally(id: string, entityTimestamp?: number): boolean {
  if (!id) return false;
  try {
    const raw = safeGetItem(STORAGE_KEYS.DELETED_IDS);
    if (!raw) return false;
    const map: Record<string, number> = JSON.parse(raw);
    const deletedTime = map[id];
    if (typeof deletedTime === 'number') {
      if (entityTimestamp && entityTimestamp > deletedTime) {
        return false;
      }
      return true;
    }
  } catch {}
  return false;
}

/**
 * รวมการตั้งค่าจาก Cloud และ Local โดยเปรียบเทียบ updatedAt:
 * - Google Sheet / Cloud = Source of Truth
 * - LocalStorage = Cache เท่านั้น
 * - หาก Cloud ใหม่กว่าหรือเท่ากับ Local -> ใช้ค่าจาก Cloud ทั้งหมด
 * - หาก Local ใหม่กว่า Cloud (เช่น เพิ่งแก้ไขก่อน Sync) -> ใช้ค่า Local และส่งขึ้น Cloud
 */
export function mergeSettingsWithCloud(local: AppSettings, cloud: Partial<AppSettings>): AppSettings {
  if (!cloud || typeof cloud !== 'object') return local;

  const localTime = parseTimestamp(local.updatedAt);
  const cloudTime = parseTimestamp(cloud.updatedAt);

  // If local settings are strictly newer than cloud, keep local settings
  if (localTime > cloudTime && localTime > 0) {
    return {
      ...local,
      googleWebAppUrl: local.googleWebAppUrl || cloud.googleWebAppUrl || DEFAULT_SETTINGS.googleWebAppUrl
    };
  }

  // Cloud is Source of Truth (cloudTime >= localTime)
  const clean = (val: any) => (val !== undefined && val !== null ? String(val).trim() : '');

  const phone = clean(cloud.defaultContactPhone);
  const line = clean(cloud.defaultContactLine);
  const name = clean(cloud.agencyName);
  const address = clean(cloud.agencyAddress);
  const email = clean(cloud.adminEmail);
  const password = clean(cloud.adminPassword);

  return {
    ...local,
    googleWebAppUrl: local.googleWebAppUrl || cloud.googleWebAppUrl || DEFAULT_SETTINGS.googleWebAppUrl,
    defaultContactPhone: phone !== '' ? phone : (clean(local.defaultContactPhone) || DEFAULT_SETTINGS.defaultContactPhone),
    defaultContactLine: line !== '' ? line : (clean(local.defaultContactLine) || DEFAULT_SETTINGS.defaultContactLine),
    agencyName: name !== '' ? name : (clean(local.agencyName) || DEFAULT_SETTINGS.agencyName),
    agencyAddress: address !== '' ? address : (clean(local.agencyAddress) || DEFAULT_SETTINGS.agencyAddress),
    adminEmail: email !== '' ? email : (clean(local.adminEmail) || DEFAULT_SETTINGS.adminEmail),
    adminPassword: password !== '' ? password : (clean(local.adminPassword) || DEFAULT_SETTINGS.adminPassword),
    heroBackgroundImages: Array.isArray(cloud.heroBackgroundImages) && cloud.heroBackgroundImages.length > 0
      ? cloud.heroBackgroundImages
      : (Array.isArray(local.heroBackgroundImages) ? local.heroBackgroundImages : []),
    updatedAt: cloud.updatedAt || local.updatedAt || new Date().toISOString()
  };
}

// Mock IDs to ensure any cached sample data in the browser is completely purged
const LEGACY_MOCK_ROOM_IDS = new Set([
  'room-571', 'room-222', 'room-116', 'room-329', 'room-540',
  'room-518', 'room-512', 'room-431', 'room-788-553', 'room-788-497',
  'room-788-451', 'room-788-429', 'room-788-440', 'room-788-194',
  'room-1', 'room-2', 'room-3', 'room-4', 'room-5', 'room-6'
]);

const LEGACY_MOCK_LEASE_IDS = new Set([
  'lease-788-440', 'lease-788-194', 'lease-788-497', 'lease-788-553',
  'lease-1', 'lease-2', 'lease-3', 'lease-old-1', 'lease-old-2'
]);

const LEGACY_MOCK_BOOKING_IDS = new Set([
  'bk-1'
]);

export function loadRooms(): Room[] {
  const saved = safeGetItem(STORAGE_KEYS.ROOMS);
  let loadedRooms: Room[] = [];
  if (saved) {
    try {
      loadedRooms = JSON.parse(saved);
      if (!Array.isArray(loadedRooms)) loadedRooms = [];
    } catch (e) {
      loadedRooms = [];
    }
  }

  // Purge any mock rooms and sanitize with strict status rules
  const sanitizedRooms = loadedRooms
    .filter(r => !LEGACY_MOCK_ROOM_IDS.has(r.id) && !(r.areaSqM === 90 && r.bedrooms === 3))
    .map(r => {
      const isTrash = r.isTrash === true || String(r.isTrash).toLowerCase() === 'true';
      let status = (r.status || 'available').trim().toLowerCase() as RoomStatus;
      let isPublished = false;

      if (isTrash) {
        isPublished = false;
      } else if (status === 'rented') {
        isPublished = false;
      } else if (status === 'pending') {
        isPublished = false;
      } else {
        status = 'available';
        isPublished = r.isPublished === true || String(r.isPublished).toLowerCase() === 'true';
      }

      return {
        ...r,
        status,
        isPublished,
        isTrash,
        images: Array.isArray(r.images)
          ? r.images.map(toDirectImageUrl).filter((img: string) => typeof img === 'string' && img.trim().length > 0 && !isMockImage(img))
          : [],
        contactLine: r.contactLine === '@bh_ram60' ? '@052adooe' : (r.contactLine || '@052adooe'),
        createdAt: r.createdAt || '',
        updatedAt: r.updatedAt || r.createdAt || ''
      };
    });

  if (sanitizedRooms.length !== loadedRooms.length || !saved) {
    safeSetItem(STORAGE_KEYS.ROOMS, sanitizedRooms);
  }

  return sanitizedRooms;
}

export function saveRooms(rooms: Room[]): void {
  const sanitized = rooms.map(r => ({
    ...r,
    createdAt: r.createdAt || '',
    updatedAt: r.updatedAt || r.createdAt || '',
    images: Array.isArray(r.images) ? r.images.map(toDirectImageUrl).filter(Boolean) : []
  }));
  safeSetItem(STORAGE_KEYS.ROOMS, sanitized);
}

export function loadLeases(): Lease[] {
  const saved = safeGetItem(STORAGE_KEYS.LEASES);
  let leases: Lease[] = [];
  if (saved) {
    try {
      leases = JSON.parse(saved);
      if (!Array.isArray(leases)) leases = [];
    } catch (e) {
      leases = [];
    }
  }

  // Purge any legacy mock leases
  const sanitizedLeases = leases.filter(l => !LEGACY_MOCK_LEASE_IDS.has(l.id));

  if (sanitizedLeases.length !== leases.length || !saved) {
    safeSetItem(STORAGE_KEYS.LEASES, sanitizedLeases);
  }

  // Recalculate daysRemaining & dynamic status on load
  return sanitizedLeases.map(l => {
    const { daysRemaining, status } = calculateLeaseDaysAndStatus(l.endDate);
    return {
      ...l,
      daysRemaining,
      status: l.status === 'terminated' ? 'terminated' : status,
      createdAt: l.createdAt || '',
      updatedAt: l.updatedAt || l.createdAt || ''
    };
  });
}

export function saveLeases(leases: Lease[]): void {
  const sanitized = leases.map(l => ({
    ...l,
    createdAt: l.createdAt || '',
    updatedAt: l.updatedAt || l.createdAt || ''
  }));
  safeSetItem(STORAGE_KEYS.LEASES, sanitized);
}

export function loadBookings(): BookingReceipt[] {
  const saved = safeGetItem(STORAGE_KEYS.BOOKINGS);
  let bookings: BookingReceipt[] = [];
  if (saved) {
    try {
      bookings = JSON.parse(saved);
      if (!Array.isArray(bookings)) bookings = [];
    } catch (e) {
      bookings = [];
    }
  }

  // Purge legacy mock bookings and ensure all 21 fields are populated
  const sanitized: BookingReceipt[] = bookings
    .filter(b => b && (b.id || b.receiptNumber) && !LEGACY_MOCK_BOOKING_IDS.has(b.id))
    .map(b => {
      const agentName = String(b.recipientName || b.agentName || '').trim();
      const recipientType = (b.recipientType || (agentName.includes('เจ้าของ') ? 'owner' : 'juristic')) as any;
      const recipientName = String(b.recipientName || agentName || (recipientType === 'owner' ? 'เจ้าของห้องชุด' : 'สำนักงานนิติบุคคล แบงค์คอก ฮอไรซอน ราม 60')).trim();

      return {
        id: String(b.id || `bk-${Date.now()}`),
        receiptNumber: String(b.receiptNumber || ''),
        bookingDate: String(b.bookingDate || ''),
        roomId: String(b.roomId || ''),
        roomNumber: String(b.roomNumber || ''),
        condoName: String(b.condoName || 'Bangkok Horizon Ram 60'),
        bookingType: (b.bookingType === 'sale' ? 'sale' : 'rent'),
        customerName: String(b.customerName || ''),
        customerPhone: String(b.customerPhone || ''),
        customerEmail: String(b.customerEmail || ''),
        customerIdCard: String(b.customerIdCard || ''),
        price: Number(b.price) || 0,
        bookingAmount: Number(b.bookingAmount) || 0,
        paymentMethod: (b.paymentMethod || 'transfer') as any,
        contractSignDate: String(b.contractSignDate || ''),
        remainingDeposit: Number(b.remainingDeposit) || 0,
        recipientType,
        recipientName,
        agentName: recipientName || agentName,
        terms: String(b.terms || ''),
        createdAt: String(b.createdAt || ''),
        updatedAt: String(b.updatedAt || b.createdAt || '')
      };
    });

  if (sanitized.length !== bookings.length || !saved) {
    safeSetItem(STORAGE_KEYS.BOOKINGS, sanitized);
  }
  return sanitized;
}

export function saveBookings(bookings: BookingReceipt[]): void {
  const sanitized = bookings.map(b => {
    const agentName = String(b.recipientName || b.agentName || '').trim();
    const recipientType = (b.recipientType || (agentName.includes('เจ้าของ') ? 'owner' : 'juristic')) as any;
    const recipientName = String(b.recipientName || agentName || (recipientType === 'owner' ? 'เจ้าของห้องชุด' : 'สำนักงานนิติบุคคล แบงค์คอก ฮอไรซอน ราม 60')).trim();

    return {
      id: String(b.id || `bk-${Date.now()}`),
      receiptNumber: String(b.receiptNumber || ''),
      bookingDate: String(b.bookingDate || ''),
      roomId: String(b.roomId || ''),
      roomNumber: String(b.roomNumber || ''),
      condoName: String(b.condoName || 'Bangkok Horizon Ram 60'),
      bookingType: (b.bookingType === 'sale' ? 'sale' : 'rent'),
      customerName: String(b.customerName || ''),
      customerPhone: String(b.customerPhone || ''),
      customerEmail: String(b.customerEmail || ''),
      customerIdCard: String(b.customerIdCard || ''),
      price: Number(b.price) || 0,
      bookingAmount: Number(b.bookingAmount) || 0,
      paymentMethod: (b.paymentMethod || 'transfer') as any,
      contractSignDate: String(b.contractSignDate || ''),
      remainingDeposit: Number(b.remainingDeposit) || 0,
      recipientType,
      recipientName,
      agentName: recipientName || agentName,
      terms: String(b.terms || ''),
      createdAt: String(b.createdAt || ''),
      updatedAt: String(b.updatedAt || b.createdAt || '')
    };
  });
  safeSetItem(STORAGE_KEYS.BOOKINGS, sanitized);
}

export function loadFacilities(): Facility[] {
  const saved = safeGetItem(STORAGE_KEYS.FACILITIES);
  let facilities: Facility[] = [];
  if (!saved) {
    facilities = INITIAL_FACILITIES;
  } else {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        facilities = parsed;
      } else {
        facilities = INITIAL_FACILITIES;
      }
    } catch (e) {
      facilities = INITIAL_FACILITIES;
    }
  }

  // Purge any mock images from facility items, sanitize to direct CDN URLs
  const sanitizedFacilities = facilities.map(f => ({
    ...f,
    images: Array.isArray(f.images)
      ? f.images.map(toDirectImageUrl).filter(img => typeof img === 'string' && img.trim().length > 0 && !isMockImage(img))
      : [],
    rules: Array.isArray(f.rules) ? f.rules : [],
    createdAt: f.createdAt || '',
    updatedAt: f.updatedAt || f.createdAt || ''
  }));

  safeSetItem(STORAGE_KEYS.FACILITIES, sanitizedFacilities);
  return sanitizedFacilities;
}

export function saveFacilities(facilities: Facility[]): void {
  const sanitized = facilities.map(f => ({
    ...f,
    images: Array.isArray(f.images)
      ? f.images.map(toDirectImageUrl).filter(img => typeof img === 'string' && img.trim().length > 0 && !isMockImage(img))
      : [],
    rules: Array.isArray(f.rules) ? f.rules : [],
    createdAt: f.createdAt || '',
    updatedAt: f.updatedAt || f.createdAt || ''
  }));
  safeSetItem(STORAGE_KEYS.FACILITIES, sanitized);
}

export function loadJuristicServices(): JuristicServiceItem[] {
  const saved = safeGetItem(STORAGE_KEYS.SERVICES);
  if (!saved) {
    safeSetItem(STORAGE_KEYS.SERVICES, INITIAL_JURISTIC_SERVICES);
    return INITIAL_JURISTIC_SERVICES;
  }
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return INITIAL_JURISTIC_SERVICES;
    return parsed.map((s: any) => ({
      ...s,
      createdAt: s.createdAt || '',
      updatedAt: s.updatedAt || s.createdAt || ''
    }));
  } catch (e) {
    return INITIAL_JURISTIC_SERVICES;
  }
}

export function saveJuristicServices(services: JuristicServiceItem[]): void {
  const sanitized = services.map(s => ({
    ...s,
    createdAt: s.createdAt || '',
    updatedAt: s.updatedAt || s.createdAt || ''
  }));
  safeSetItem(STORAGE_KEYS.SERVICES, sanitized);
}

// -----------------------------------------------------------------------------
// Google Apps Script API Connector
// -----------------------------------------------------------------------------

export async function testGasConnection(webAppUrl: string): Promise<{ success: boolean; message: string; data?: any }> {
  if (!webAppUrl || !webAppUrl.startsWith('http')) {
    return { success: false, message: 'กรุณากรอก Web App URL ให้ถูกต้อง (ขึ้นต้นด้วย https://script.google.com/...)' };
  }

  try {
    const response = await fetch(`${webAppUrl}?action=ping`, {
      method: 'GET',
      mode: 'cors',
    });
    const result = await response.json();
    if (result.success) {
      return {
        success: true,
        message: result.configured 
          ? `เชื่อมต่อ Google Sheet สำเร็จแล้ว! (${result.spreadsheetName || 'พร้อมใช้งาน'})`
          : `เชื่อมต่อสำเร็จ แต่ยังไม่ได้สร้าง Sheet กรุณารัน setupProject หรือกดปุ่ม 'ตั้งค่าชีตอัตโนมัติ'`,
        data: result
      };
    } else {
      return { success: false, message: result.error || 'การเชื่อมต่อผิดพลาด' };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `ไม่สามารถเชื่อมต่อได้: ${error.message || 'โปรดตรวจสอบว่าได้เลือก "Who has access: Anyone" ในขั้นตอน Deploy แล้วหรือยัง'}`
    };
  }
}

export async function triggerGasSetup(webAppUrl: string): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const response = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'setup' })
    });
    const result = await response.json();
    return result;
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

// Concurrency Lock for Cloud Sync to prevent overlapping sync operations
let activeSyncPromise: Promise<{ 
  success: boolean; 
  rooms?: Room[]; 
  leases?: Lease[]; 
  bookings?: BookingReceipt[]; 
  facilities?: Facility[];
  juristicServices?: JuristicServiceItem[];
  settings?: Partial<AppSettings>; 
  error?: string 
}> | null = null;

export async function syncFromGas(webAppUrl: string): Promise<{ 
  success: boolean; 
  rooms?: Room[]; 
  leases?: Lease[]; 
  bookings?: BookingReceipt[]; 
  facilities?: Facility[];
  juristicServices?: JuristicServiceItem[];
  settings?: Partial<AppSettings>; 
  error?: string 
}> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = performSyncFromGas(webAppUrl).finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}

async function performSyncFromGas(webAppUrl: string): Promise<{ 
  success: boolean; 
  rooms?: Room[]; 
  leases?: Lease[]; 
  bookings?: BookingReceipt[]; 
  facilities?: Facility[];
  juristicServices?: JuristicServiceItem[];
  settings?: Partial<AppSettings>; 
  error?: string 
}> {
  try {
    const res = await fetch(`${webAppUrl}?action=syncAll`, { 
      method: 'GET', 
      mode: 'cors',
      cache: 'no-cache'
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ไม่สามารถดึงข้อมูลจาก Google Apps Script ได้` };
    }
    const data = await res.json();
    if (data.success) {
      const validRooms: Room[] = Array.isArray(data.rooms) ? data.rooms : [];
      const validLeases: Lease[] = Array.isArray(data.leases) ? data.leases : [];
      const validBookings: any[] = Array.isArray(data.bookings) ? data.bookings : [];
      const validFacilities: Facility[] = Array.isArray(data.facilities) ? data.facilities : [];
      const validServices: JuristicServiceItem[] = Array.isArray(data.juristicServices) ? data.juristicServices : [];

      // Load FRESH local cache immediately before merging to capture any writes made during the fetch
      const localRooms = loadRooms();
      const localLeases = loadLeases();
      const localBookings = loadBookings();
      const localFacilities = loadFacilities();
      const localServices = loadJuristicServices();

      // =========================================================================
      // 1. Rooms Merge: Google Sheet = Source of Truth, LocalStorage = Cache
      // =========================================================================
      const roomMap = new Map<string, Room>();
      validRooms.forEach((cr: Room) => {
        if (!cr || !cr.id) return;
        const crTime = parseTimestamp(cr.updatedAt || cr.createdAt);
        if (isEntityDeletedLocally(cr.id, crTime)) return;

        const isTrash = cr.isTrash === true || String(cr.isTrash).toLowerCase() === 'true';
        let status = (cr.status || 'available').trim().toLowerCase() as RoomStatus;
        let isPublished = false;

        if (isTrash) {
          isPublished = false;
        } else if (status === 'rented') {
          isPublished = false;
        } else if (status === 'pending') {
          isPublished = false;
        } else {
          status = 'available';
          isPublished = cr.isPublished === true || String(cr.isPublished).toLowerCase() === 'true';
        }

        const normCr: Room = {
          ...cr,
          status,
          isPublished,
          isTrash,
          images: Array.isArray(cr.images)
            ? cr.images.map(toDirectImageUrl).filter((img: string) => typeof img === 'string' && img.trim().length > 0 && !isMockImage(img))
            : [],
          highlights: Array.isArray(cr.highlights) ? cr.highlights : [],
          amenities: Array.isArray(cr.amenities) ? cr.amenities : [],
          createdAt: cr.createdAt || '',
          updatedAt: cr.updatedAt || cr.createdAt || ''
        };
        roomMap.set(cr.id, normCr);
      });

      localRooms.forEach((lr: Room) => {
        if (!lr || !lr.id || LEGACY_MOCK_ROOM_IDS.has(lr.id)) return;
        const lrTime = parseTimestamp(lr.updatedAt || lr.createdAt);
        if (isEntityDeletedLocally(lr.id, lrTime)) return;

        const cr = roomMap.get(lr.id) || Array.from(roomMap.values()).find(
          r => r.roomNumber && lr.roomNumber && String(r.roomNumber).trim() === String(lr.roomNumber).trim()
        );

        if (!cr) {
          // Newly added local room offline -> keep in cache and sync to cloud
          roomMap.set(lr.id, lr);
          saveRoomToGas(webAppUrl, lr).catch(() => {});
        } else {
          const cloudTime = getEntityTimestamp(cr);
          const localTime = getEntityTimestamp(lr);

          if (localTime > cloudTime && localTime > 0) {
            // Local is strictly newer -> Local wins and syncs to cloud
            roomMap.set(cr.id, lr);
            saveRoomToGas(webAppUrl, lr).catch(() => {});
          } else {
            // Cloud is newer or equal -> Cloud wins (Source of Truth)!
            if (Array.isArray(lr.images) && lr.images.length > 0 && (!cr.images || cr.images.length === 0)) {
              cr.images = lr.images.map(toDirectImageUrl).filter(Boolean);
            } else if (Array.isArray(cr.images)) {
              cr.images = cr.images.map(toDirectImageUrl).filter(Boolean);
            }
            roomMap.set(cr.id, cr);
          }
        }
      });
      const finalRooms = Array.from(roomMap.values());

      // =========================================================================
      // 2. Leases Merge
      // =========================================================================
      const leaseMap = new Map<string, Lease>();
      validLeases.forEach((cl: Lease) => {
        if (!cl || !cl.id) return;
        const clTime = parseTimestamp(cl.updatedAt || cl.createdAt);
        if (isEntityDeletedLocally(cl.id, clTime)) return;

        const normCl: Lease = {
          ...cl,
          createdAt: cl.createdAt || '',
          updatedAt: cl.updatedAt || cl.createdAt || ''
        };
        leaseMap.set(cl.id, normCl);
      });

      localLeases.forEach((ll: Lease) => {
        if (!ll || !ll.id || LEGACY_MOCK_LEASE_IDS.has(ll.id)) return;
        const llTime = parseTimestamp(ll.updatedAt || ll.createdAt);
        if (isEntityDeletedLocally(ll.id, llTime)) return;

        const cl = leaseMap.get(ll.id);
        if (!cl) {
          // Newly added local lease offline -> keep and sync to cloud
          leaseMap.set(ll.id, ll);
          saveLeaseToGas(webAppUrl, ll).catch(() => {});
        } else {
          const cloudTime = getEntityTimestamp(cl);
          const localTime = getEntityTimestamp(ll);

          if (localTime > cloudTime && localTime > 0) {
            // Local is strictly newer -> Local wins and syncs to cloud
            leaseMap.set(cl.id, ll);
            saveLeaseToGas(webAppUrl, ll).catch(() => {});
          } else {
            // Cloud is newer or equal -> Cloud wins!
            leaseMap.set(cl.id, cl);
          }
        }
      });
      const finalLeases = Array.from(leaseMap.values());

      // =========================================================================
      // 3. Bookings Merge
      // =========================================================================
      const bookingMap = new Map<string, BookingReceipt>();
      validBookings.forEach((cb: any) => {
        if (!cb || (!cb.id && !cb.receiptNumber)) return;
        const cbTime = parseTimestamp(cb.updatedAt || cb.createdAt);
        if (isEntityDeletedLocally(cb.id, cbTime)) return;

        const normCb: BookingReceipt = {
          id: String(cb.id || `bk-${Date.now()}`),
          receiptNumber: String(cb.receiptNumber || ''),
          bookingDate: String(cb.bookingDate || ''),
          roomId: String(cb.roomId || ''),
          roomNumber: String(cb.roomNumber || ''),
          condoName: String(cb.condoName || 'Bangkok Horizon Ram 60'),
          bookingType: (cb.bookingType === 'sale' ? 'sale' : 'rent'),
          customerName: String(cb.customerName || ''),
          customerPhone: String(cb.customerPhone || ''),
          customerEmail: String(cb.customerEmail || ''),
          customerIdCard: String(cb.customerIdCard || ''),
          price: Number(cb.price) || 0,
          bookingAmount: Number(cb.bookingAmount) || 0,
          paymentMethod: (cb.paymentMethod || 'transfer') as any,
          contractSignDate: String(cb.contractSignDate || ''),
          remainingDeposit: Number(cb.remainingDeposit) || 0,
          recipientType: (cb.recipientType || (cb.agentName && cb.agentName.includes('เจ้าของ') ? 'owner' : 'juristic')) as any,
          recipientName: String(cb.recipientName || cb.agentName || ''),
          agentName: String(cb.recipientName || cb.agentName || ''),
          terms: String(cb.terms || ''),
          createdAt: String(cb.createdAt || ''),
          updatedAt: String(cb.updatedAt || cb.createdAt || '')
        };
        bookingMap.set(normCb.id, normCb);
      });

      localBookings.forEach((lb: BookingReceipt) => {
        if (!lb || (!lb.id && !lb.receiptNumber) || LEGACY_MOCK_BOOKING_IDS.has(lb.id)) return;
        const lbTime = parseTimestamp(lb.updatedAt || lb.createdAt);
        if (isEntityDeletedLocally(lb.id, lbTime)) return;

        const cb = bookingMap.get(lb.id) || Array.from(bookingMap.values()).find(
          b => b.receiptNumber && lb.receiptNumber && b.receiptNumber.trim() === lb.receiptNumber.trim()
        );
        if (!cb) {
          bookingMap.set(lb.id, lb);
          saveBookingToGas(webAppUrl, lb).catch(() => {});
        } else {
          const cloudTime = getEntityTimestamp(cb);
          const localTime = getEntityTimestamp(lb);

          if (localTime > cloudTime && localTime > 0) {
            // Local is strictly newer -> Local wins and syncs to cloud
            bookingMap.set(cb.id, lb);
            saveBookingToGas(webAppUrl, lb).catch(() => {});
          } else {
            // Cloud is newer or equal -> Cloud wins!
            bookingMap.set(cb.id, cb);
          }
        }
      });
      const finalBookings = Array.from(bookingMap.values());

      // =========================================================================
      // 4. Facilities Merge
      // =========================================================================
      let rawCloudFacilities = validFacilities;
      if (rawCloudFacilities.length === 0) {
        try {
          const facFallback = await getFacilitiesFromGas(webAppUrl);
          if (facFallback.success && Array.isArray(facFallback.data) && facFallback.data.length > 0) {
            rawCloudFacilities = facFallback.data;
          }
        } catch {}
      }

      const facMap = new Map<string, Facility>();
      rawCloudFacilities.forEach((cf: Facility) => {
        if (!cf || !cf.id) return;
        const cfTime = parseTimestamp(cf.updatedAt || cf.createdAt);
        if (isEntityDeletedLocally(cf.id, cfTime)) return;

        facMap.set(cf.id, {
          ...cf,
          images: Array.isArray(cf.images)
            ? cf.images.map(toDirectImageUrl).filter((img: string) => typeof img === 'string' && img.trim().length > 0 && !isMockImage(img))
            : [],
          rules: Array.isArray(cf.rules) ? cf.rules : [],
          createdAt: cf.createdAt || '',
          updatedAt: cf.updatedAt || cf.createdAt || ''
        });
      });

      localFacilities.forEach((lf: Facility) => {
        if (!lf || !lf.id) return;
        const lfTime = parseTimestamp(lf.updatedAt || lf.createdAt);
        if (isEntityDeletedLocally(lf.id, lfTime)) return;

        const cf = facMap.get(lf.id);
        if (!cf) {
          facMap.set(lf.id, lf);
          saveFacilityToGas(webAppUrl, lf).catch(() => {});
        } else {
          const cloudTime = getEntityTimestamp(cf);
          const localTime = getEntityTimestamp(lf);

          if (localTime > cloudTime && localTime > 0) {
            // Local is strictly newer -> Local wins and syncs to cloud
            facMap.set(cf.id, lf);
            saveFacilityToGas(webAppUrl, lf).catch(() => {});
          } else {
            // Cloud is newer or equal -> Cloud wins!
            if (Array.isArray(lf.images) && lf.images.length > 0 && (!cf.images || cf.images.length === 0)) {
              cf.images = lf.images.map(toDirectImageUrl).filter(Boolean);
            }
            facMap.set(cf.id, cf);
          }
        }
      });
      const finalFacilities = Array.from(facMap.values());

      // =========================================================================
      // 5. Juristic Services Merge
      // =========================================================================
      const srvMap = new Map<string, JuristicServiceItem>();
      validServices.forEach((cs: JuristicServiceItem) => {
        if (!cs || !cs.id) return;
        const csTime = parseTimestamp(cs.updatedAt || cs.createdAt);
        if (isEntityDeletedLocally(cs.id, csTime)) return;

        srvMap.set(cs.id, {
          ...cs,
          createdAt: cs.createdAt || '',
          updatedAt: cs.updatedAt || cs.createdAt || ''
        });
      });

      localServices.forEach((ls: JuristicServiceItem) => {
        if (!ls || !ls.id) return;
        const lsTime = parseTimestamp(ls.updatedAt || ls.createdAt);
        if (isEntityDeletedLocally(ls.id, lsTime)) return;

        const cs = srvMap.get(ls.id);
        if (!cs) {
          srvMap.set(ls.id, ls);
          saveJuristicServiceToGas(webAppUrl, ls).catch(() => {});
        } else {
          const cloudTime = getEntityTimestamp(cs);
          const localTime = getEntityTimestamp(ls);

          if (localTime > cloudTime && localTime > 0) {
            // Local is strictly newer -> Local wins and syncs to cloud
            srvMap.set(cs.id, ls);
            saveJuristicServiceToGas(webAppUrl, ls).catch(() => {});
          } else {
            // Cloud is newer or equal -> Cloud wins!
            srvMap.set(cs.id, cs);
          }
        }
      });
      const finalServices = Array.from(srvMap.values());

      // =========================================================================
      // 6. Settings Merge
      // =========================================================================
      const current = loadSettings();
      let mergedSettings: AppSettings = current;

      if (data.settings && typeof data.settings === 'object') {
        mergedSettings = mergeSettingsWithCloud(current, data.settings);
        const localTime = parseTimestamp(current.updatedAt);
        const cloudTime = parseTimestamp(data.settings.updatedAt);
        if (localTime > cloudTime && localTime > 0) {
          syncSettingsToGas(webAppUrl, current).catch(() => {});
        }
      }

      // =========================================================================
      // 7. Update Local Cache with resolved freshest data
      // =========================================================================
      saveRooms(finalRooms);
      saveLeases(finalLeases);
      saveBookings(finalBookings);
      saveFacilities(finalFacilities);
      saveJuristicServices(finalServices);
      saveSettings(mergedSettings);

      return {
        success: true,
        rooms: finalRooms,
        leases: finalLeases,
        bookings: finalBookings,
        facilities: finalFacilities,
        juristicServices: finalServices,
        settings: mergedSettings
      };
    } else {
      return { success: false, error: data.error || 'Google Apps Script ส่งคืนสถานะไม่สำเร็จ' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' };
  }
}

export async function syncSettingsToGas(webAppUrl: string, settings: AppSettings): Promise<{ success: boolean; settings?: AppSettings; message?: string }> {
  if (!webAppUrl) return { success: false, message: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const payload = {
      action: 'saveSettings',
      settings: {
        adminPassword: String(settings.adminPassword || '7014').trim(),
        adminEmail: String(settings.adminEmail || '').trim(),
        agencyName: String(settings.agencyName || '').trim(),
        defaultContactPhone: String(settings.defaultContactPhone || '').trim(),
        defaultContactLine: String(settings.defaultContactLine || '').trim(),
        agencyAddress: String(settings.agencyAddress || '').trim(),
        heroBackgroundImages: Array.isArray(settings.heroBackgroundImages) ? settings.heroBackgroundImages : [],
        updatedAt: settings.updatedAt || new Date().toISOString()
      }
    };
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      if (res.ok) {
        return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheet สำเร็จ' };
      }
      return { success: false, message: 'ไม่ได้รับการตอบกลับ JSON จาก Google Apps Script' };
    }
    if (json && json.success) {
      return {
        success: true,
        settings: json.settings,
        message: json.message || 'บันทึกการตั้งค่าลง Google Sheet สำเร็จ'
      };
    }
    return { success: false, message: json?.error || 'บันทึกการตั้งค่าไม่สำเร็จ' };
  } catch (err: any) {
    return { success: false, message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' };
  }
}

export async function getSettingsFromGas(webAppUrl: string): Promise<{ success: boolean; settings?: AppSettings; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(`${webAppUrl}?action=getSettings`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ไม่สามารถดึงการตั้งค่าได้` };
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON' };
    }
    if (json && json.success && json.settings) {
      return { success: true, settings: json.settings };
    }
    return { success: false, error: json?.error || 'ไม่พบการตั้งค่า' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function syncToGas(
  webAppUrl: string, 
  rooms?: Room[], 
  leases?: Lease[], 
  bookings?: BookingReceipt[],
  facilities?: Facility[],
  juristicServices?: JuristicServiceItem[],
  settings?: AppSettings
): Promise<{ success: boolean; message: string }> {
  if (!webAppUrl) return { success: false, message: 'ยังไม่ได้ระบุ Web App URL' };

  try {
    // If settings provided with explicit changes, sync them
    if (settings && settings.updatedAt) {
      await syncSettingsToGas(webAppUrl, settings);
    }

    // Perform two-way smart sync to prevent older local data from overwriting newer cloud data
    const res = await syncFromGas(webAppUrl);
    if (res.success) {
      return { success: true, message: 'ซิงค์ข้อมูลกับ Google Sheet สำเร็จแล้ว (เปรียบเทียบข้อมูลล่าสุดเรียบร้อย)' };
    }
    return { success: false, message: res.error || 'ซิงค์ข้อมูลไม่สำเร็จ' };
  } catch (err: any) {
    return { success: false, message: 'การส่งข้อมูลขัดข้อง: ' + err.message };
  }
}

/**
 * บันทึกห้องชุดเดี่ยวขึ้น Google Sheet ทันที (Background Auto-Sync)
 */
export async function saveRoomToGas(webAppUrl: string, room: Room): Promise<{ success: boolean; error?: string; room?: Room }> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveRoom', room })
    });
    
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // If response text is not valid JSON (e.g. Google redirect HTML), verify if room was written
      if (res.ok) {
        try {
          const verifyRes = await fetch(`${webAppUrl}?action=getRooms`, { method: 'GET', mode: 'cors', cache: 'no-cache' });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.success && Array.isArray(verifyData.data)) {
              const found = verifyData.data.some((r: any) => r.id === room.id || (r.roomNumber && String(r.roomNumber).trim() === String(room.roomNumber).trim()));
              if (found) {
                return { success: true, room };
              }
            }
          }
        } catch {}
      }
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON จาก Google Apps Script' };
    }

    if (data && data.success) {
      const confirmedRoom: Room = data.room ? {
        ...data.room,
        updatedAt: data.room.updatedAt || room.updatedAt || new Date().toISOString()
      } : room;
      return { success: true, room: confirmedRoom };
    }
    return { success: false, error: data?.error || 'บันทึกลง Google Sheet ไม่สำเร็จ' };
  } catch (err: any) {
    console.warn('Auto-sync room error:', err);
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' };
  }
}

/**
 * ลบห้องชุดออกจาก Google Sheet ทันที
 */
export async function deleteRoomFromGas(webAppUrl: string, id: string): Promise<{ success: boolean; error?: string }> {
  recordDeletedEntityId(id);
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteRoom', id })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Delete room GAS error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * บันทึกสัญญาเช่าเดี่ยวขึ้น Google Sheet ทันที (Background Auto-Sync)
 */
export async function saveLeaseToGas(webAppUrl: string, lease: Lease): Promise<{ success: boolean; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveLease', lease })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Auto-sync lease error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * ลบสัญญาเช่าออกจาก Google Sheet ทันที
 */
export async function deleteLeaseFromGas(webAppUrl: string, id: string): Promise<{ success: boolean; error?: string }> {
  recordDeletedEntityId(id);
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteLease', id })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Delete lease GAS error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * บันทึกใบจองห้องชุดเดี่ยวขึ้น Google Sheet ทันที พร้อมยืนยันผลลัพธ์
 */
export async function saveBookingToGas(webAppUrl: string, booking: BookingReceipt): Promise<{ success: boolean; error?: string; booking?: BookingReceipt }> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveBooking', booking })
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // If response text is not valid JSON (e.g. Google redirect HTML), verify if booking was written
      if (res.ok) {
        try {
          const verifyRes = await getBookingsFromGas(webAppUrl);
          if (verifyRes.success && Array.isArray(verifyRes.data)) {
            const found = verifyRes.data.find(b => b.id === booking.id || (b.receiptNumber && b.receiptNumber === booking.receiptNumber));
            if (found) {
              return { success: true, booking: found };
            }
          }
        } catch {}
        return { success: true, booking };
      }
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON จาก Google Apps Script' };
    }
    if (data && data.success) {
      const confirmedBooking: BookingReceipt = data.booking ? {
        ...data.booking,
        updatedAt: data.booking.updatedAt || booking.updatedAt || new Date().toISOString()
      } : booking;
      return { success: true, booking: confirmedBooking };
    }
    return { success: false, error: data?.error || 'บันทึกใบจองไม่สำเร็จ' };
  } catch (err: any) {
    console.warn('Auto-sync booking error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * ดึงข้อมูลใบจองห้องชุดทั้งหมดจาก Google Sheet
 */
export async function getBookingsFromGas(webAppUrl: string): Promise<{ success: boolean; data?: BookingReceipt[]; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(`${webAppUrl}?action=getBookings`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ไม่สามารถดึงข้อมูลใบจองได้` };
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON' };
    }
    if (json && json.success && Array.isArray(json.data)) {
      const sanitized: BookingReceipt[] = json.data
        .filter((b: any) => b && (b.id || b.receiptNumber) && !LEGACY_MOCK_BOOKING_IDS.has(b.id))
        .map((b: any) => {
          const agentName = String(b.recipientName || b.agentName || '').trim();
          const recipientType = (b.recipientType || (agentName.includes('เจ้าของ') ? 'owner' : 'juristic')) as any;
          const recipientName = String(b.recipientName || agentName || (recipientType === 'owner' ? 'เจ้าของห้องชุด' : 'สำนักงานนิติบุคคล แบงค์คอก ฮอไรซอน ราม 60')).trim();

          return {
            id: String(b.id || `bk-${Date.now()}`),
            receiptNumber: String(b.receiptNumber || ''),
            bookingDate: String(b.bookingDate || new Date().toISOString().split('T')[0]),
            roomId: String(b.roomId || ''),
            roomNumber: String(b.roomNumber || ''),
            condoName: String(b.condoName || 'Bangkok Horizon Ram 60'),
            bookingType: (b.bookingType === 'sale' ? 'sale' : 'rent'),
            customerName: String(b.customerName || ''),
            customerPhone: String(b.customerPhone || ''),
            customerEmail: String(b.customerEmail || ''),
            customerIdCard: String(b.customerIdCard || ''),
            price: Number(b.price) || 0,
            bookingAmount: Number(b.bookingAmount) || 0,
            paymentMethod: (b.paymentMethod || 'transfer') as any,
            contractSignDate: String(b.contractSignDate || ''),
            remainingDeposit: Number(b.remainingDeposit) || 0,
            recipientType,
            recipientName,
            agentName: recipientName || agentName,
            terms: String(b.terms || ''),
            createdAt: String(b.createdAt || new Date().toISOString())
          };
        });
      return { success: true, data: sanitized };
    }
    return { success: false, error: json?.error || 'ไม่พบข้อมูลใบจอง' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * ลบใบจองออกจาก Google Sheet
 */
export async function deleteBookingFromGas(webAppUrl: string, id: string): Promise<{ success: boolean; error?: string }> {
  recordDeletedEntityId(id);
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteBooking', id })
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: res.ok };
    }
    return { success: json?.success ?? res.ok, error: json?.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * ดึงข้อมูลสิ่งอำนวยความสะดวกส่วนกลางจาก Google Sheet
 */
export async function getFacilitiesFromGas(webAppUrl: string): Promise<{ success: boolean; data?: Facility[]; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(`${webAppUrl}?action=getFacilities`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ไม่สามารถดึงข้อมูลส่วนกลางได้` };
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON จาก Google Apps Script' };
    }

    if (json && json.success && Array.isArray(json.data)) {
      const sanitized = json.data.map((f: any): Facility => ({
        id: String(f.id || `fac-${Date.now()}`),
        name: String(f.name || ''),
        nameEn: String(f.nameEn || ''),
        floor: String(f.floor || ''),
        description: String(f.description || ''),
        hours: String(f.hours || ''),
        images: Array.isArray(f.images)
          ? f.images.map(toDirectImageUrl).filter((img: string) => typeof img === 'string' && img.trim().length > 0 && !isMockImage(img))
          : [],
        rules: Array.isArray(f.rules) ? f.rules : [],
        iconType: f.iconType || 'pool'
      }));
      return { success: true, data: sanitized };
    }
    return { success: false, error: json?.error || 'ไม่สามารถอ่านข้อมูลส่วนกลางจาก Google Sheet ได้' };
  } catch (err: any) {
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' };
  }
}

/**
 * บันทึกสิ่งอำนวยความสะดวกส่วนกลางเดี่ยวขึ้น Google Sheet ทันที (พร้อมอัปโหลดรูปภาพขึ้น Google Drive อัตโนมัติ)
 */
export async function saveFacilityToGas(webAppUrl: string, facility: Facility): Promise<{ success: boolean; facility?: Facility; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Google Apps Script Web App URL' };

  try {
    // 1. ตรวจสอบและอัปโหลดรูปภาพ Base64 ขึ้น Google Drive โฟลเดอร์ ส่วนกลาง_Facilities ก่อน
    // เพื่อป้องกันความยาวตัวอักษรเกินขีดจำกัดของเซลล์ใน Google Sheet (50,000 ตัวอักษร)
    const processedImages: string[] = [];
    if (Array.isArray(facility.images)) {
      for (let i = 0; i < facility.images.length; i++) {
        const img = facility.images[i];
        if (!img || typeof img !== 'string') continue;
        const trimmed = img.trim();

        if (trimmed.startsWith('data:image') || (trimmed.includes('base64,') && trimmed.length > 500)) {
          try {
            const uploadRes = await uploadImageToDrive(
              webAppUrl,
              trimmed,
              `facility_${facility.id || 'fac'}_${Date.now()}_${i}.jpg`,
              'image/jpeg',
              undefined,
              'facilities'
            );
            if (uploadRes.success && uploadRes.url) {
              processedImages.push(toDirectImageUrl(uploadRes.url));
            } else {
              console.warn('Facility image drive upload note:', uploadRes.error);
              if (trimmed.length < 500) {
                processedImages.push(trimmed);
              }
            }
          } catch (e) {
            console.warn('Facility image upload exception:', e);
            if (trimmed.length < 500) {
              processedImages.push(trimmed);
            }
          }
        } else {
          processedImages.push(toDirectImageUrl(trimmed));
        }
      }
    }

    const facilityToSave: Facility = {
      ...facility,
      images: processedImages,
      rules: Array.isArray(facility.rules) ? facility.rules : []
    };

    // 2. ส่งข้อมูลบันทึกลง Google Sheet
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveFacility', facility: facilityToSave })
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Fallback verification via getFacilities
      if (res.ok) {
        try {
          const verifyRes = await getFacilitiesFromGas(webAppUrl);
          if (verifyRes.success && Array.isArray(verifyRes.data)) {
            const found = verifyRes.data.find(f => f.id === facilityToSave.id);
            if (found) {
              return { success: true, facility: found };
            }
          }
        } catch {}
      }
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON จาก Google Apps Script' };
    }

    if (data && data.success) {
      const confirmedFacility: Facility = data.facility ? {
        ...data.facility,
        images: Array.isArray(data.facility.images) ? data.facility.images.map(toDirectImageUrl) : facilityToSave.images
      } : facilityToSave;

      return { success: true, facility: confirmedFacility };
    }

    return { success: false, error: data?.error || 'บันทึกลง Google Sheet ไม่สำเร็จ' };
  } catch (err: any) {
    console.warn('Auto-sync facility error:', err);
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' };
  }
}

/**
 * ลบสิ่งอำนวยความสะดวกส่วนกลางออกจาก Google Sheet
 */
export async function deleteFacilityFromGas(webAppUrl: string, id: string): Promise<{ success: boolean; error?: string }> {
  recordDeletedEntityId(id);
  if (!webAppUrl) return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteFacility', id })
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: res.ok };
    }
    return { success: !!data.success, error: data.error };
  } catch (err: any) {
    console.warn('Delete facility GAS error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * บันทึกสิ่งอำนวยความสะดวกส่วนกลางทั้งหมดขึ้น Google Sheet (Bulk Save)
 */
export async function saveFacilitiesToGas(webAppUrl: string, facilities: Facility[]): Promise<{ success: boolean; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveFacilities', facilities })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Bulk save facilities error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * บันทึกบริการนิติบุคคล / ระเบียบเดี่ยวขึ้น Google Sheet ทันที
 */
export async function saveJuristicServiceToGas(webAppUrl: string, service: JuristicServiceItem): Promise<{ success: boolean; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveJuristicService', service })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Auto-sync juristic service error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * ลบบริการนิติบุคคล / ระเบียบออกจาก Google Sheet
 */
export async function deleteJuristicServiceFromGas(webAppUrl: string, id: string): Promise<{ success: boolean; error?: string }> {
  recordDeletedEntityId(id);
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteJuristicService', id })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Delete juristic service GAS error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * บันทึกบริการนิติบุคคล / ระเบียบทั้งหมดขึ้น Google Sheet (Bulk Save)
 */
export async function saveJuristicServicesToGas(webAppUrl: string, services: JuristicServiceItem[]): Promise<{ success: boolean; error?: string }> {
  if (!webAppUrl) return { success: false, error: 'No GAS URL' };
  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveJuristicServices', services })
    });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    console.warn('Bulk save juristic services error:', err);
    return { success: false, error: err.message };
  }
}

export async function uploadImageToDrive(
  webAppUrl: string, 
  base64Data: string, 
  fileName: string, 
  mimeType: string = 'image/jpeg',
  roomNumber?: string,
  subfolderType: string = 'photos'
): Promise<{ success: boolean; url?: string; viewUrl?: string; driveUrl?: string; folderUrl?: string; error?: string }> {
  const effectiveUrl = webAppUrl || loadSettings().googleWebAppUrl || DEFAULT_SETTINGS.googleWebAppUrl;
  if (!effectiveUrl) {
    return { success: false, error: 'ยังไม่ได้ระบุ Google Apps Script Web App URL' };
  }

  try {
    const res = await fetch(effectiveUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadFile',
        base64Data,
        fileName,
        mimeType,
        roomNumber,
        subfolderType
      })
    });
    
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: 'ไม่ได้รับการตอบกลับ JSON จาก Google Apps Script' };
    }

    if (json && json.success) {
      const rawUrl = json.url || json.directUrl || json.viewUrl || (json.fileId ? `https://lh3.googleusercontent.com/d/${json.fileId}` : '');
      const directUrl = toDirectImageUrl(rawUrl);
      return { 
        success: true, 
        url: directUrl, 
        viewUrl: directUrl,
        driveUrl: json.driveUrl || (json.fileId ? `https://drive.google.com/file/d/${json.fileId}/view` : directUrl),
        folderUrl: json.folderUrl
      };
    } else {
      return { success: false, error: json?.error || 'Google Drive ปฏิเสธการอัปโหลด' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'การเชื่อมต่อกับ Google Apps Script ล้มเหลว' };
  }
}

export async function uploadDocumentToDrive(
  webAppUrl: string, 
  base64Data: string, 
  fileName: string, 
  mimeType: string = 'application/pdf',
  roomNumber?: string,
  subfolderType: string = 'contracts'
): Promise<{ success: boolean; url?: string; viewUrl?: string; driveUrl?: string; folderUrl?: string; error?: string }> {
  if (!webAppUrl) {
    // Fallback in offline / demo mode: return the base64 data url directly so user can still preview
    return { success: true, url: base64Data, viewUrl: base64Data };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadFile',
        base64Data,
        fileName,
        mimeType,
        roomNumber,
        subfolderType
      })
    });
    const json = await res.json();
    if (json.success) {
      // Prioritize the direct file viewer link (opens the exact file viewer, not the folder)
      const directFileViewer = json.driveUrl || json.viewUrl || json.url;
      return { 
        success: true, 
        url: directFileViewer, 
        viewUrl: json.viewUrl,
        driveUrl: json.driveUrl || directFileViewer,
        folderUrl: json.folderUrl
      };
    } else {
      return { success: false, error: json.error };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * เปิดดูไฟล์เอกสารสัญญาฉบับจริงโดยตรงในแท็บใหม่ (Direct Single-File Viewer)
 * 1. กรณีเป็นไฟล์บน Google Drive: จะเปิดหน้าแสดงผลไฟล์ฉบับนั้นโดยตรง (File Viewer) ไม่ใช่หน้าโฟลเดอร์ ไม่ต้องค้นหาเอง
 * 2. กรณีเป็น Base64 Data URL (โหมดออฟไลน์/ทดสอบ): แปลงเป็น Blob URL แล้วเปิดผ่าน Browser PDF Viewer ทันที
 */
export function openDocumentInNewTab(url: string | undefined): void {
  if (!url) return;

  // Case 1: Base64 Data URL (รองรับการเปิดดูแบบออฟไลน์)
  if (url.startsWith('data:')) {
    try {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
      const byteCharacters = atob(parts[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      return;
    } catch (e) {
      console.error('Failed to convert base64 to blob URL', e);
    }
  }

  // Case 2: Google Drive URL
  // รับประกันว่าจะชี้ไปที่ตัวไฟล์นั้นโดยตรง (https://drive.google.com/file/d/FILE_ID/view)
  let directViewerUrl = url;
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                      url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || 
                      url.match(/\/d\/([a-zA-Z0-9_-]+)/);

  if (fileIdMatch && fileIdMatch[1] && (url.includes('drive.google.com') || url.includes('lh3.googleusercontent.com') || url.includes('google.com'))) {
    directViewerUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
  }

  window.open(directViewerUrl, '_blank', 'noopener,noreferrer');
}
