import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CustomerView } from './components/CustomerView';
import { AdminPortal } from './components/AdminPortal';
import { RoomDetailModal } from './components/RoomDetailModal';
import { HorizontalRoomFlyerModal } from './components/HorizontalRoomFlyerModal';
import { BookingReceiptModal } from './components/BookingReceiptModal';
import { LoginModal } from './components/LoginModal';
import { Toast } from './components/Toast';

import { Room, RoomStatus, Lease, BookingReceipt, AppSettings, Facility, JuristicServiceItem } from './types';
import { 
  loadRooms, 
  saveRooms, 
  loadLeases, 
  saveLeases, 
  loadBookings, 
  saveBookings, 
  loadSettings, 
  saveSettings,
  loadFacilities,
  saveFacilities,
  loadJuristicServices,
  saveJuristicServices,
  testGasConnection,
  syncFromGas,
  syncToGas,
  saveRoomToGas,
  deleteRoomFromGas,
  saveLeaseToGas,
  deleteLeaseFromGas,
  saveBookingToGas,
  getBookingsFromGas,
  deleteBookingFromGas,
  saveFacilityToGas,
  deleteFacilityFromGas,
  getFacilitiesFromGas,
  getSettingsFromGas,
  toDirectImageUrl,
  saveJuristicServiceToGas,
  deleteJuristicServiceFromGas,
  syncSettingsToGas,
  mergeSettingsWithCloud,
  calculateLeaseDaysAndStatus,
  recordDeletedEntityId
} from './services/apiService';
import { FacilityDetailModal } from './components/FacilityDetailModal';

export default function App() {
  // Current view: customer or admin (defaults to admin if session is already active)
  const [currentView, setCurrentView] = useState<'customer' | 'admin'>(() => {
    return localStorage.getItem('condohub_admin_session') === 'true' || sessionStorage.getItem('condohub_admin_session') === 'true' ? 'admin' : 'customer';
  });

  // Authentication State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('condohub_admin_session') === 'true' || sessionStorage.getItem('condohub_admin_session') === 'true';
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isSyncingGas, setIsSyncingGas] = useState<boolean>(false);

  // Core Data Collections
  const [rooms, setRooms] = useState<Room[]>(() => loadRooms());
  const [leases, setLeases] = useState<Lease[]>(() => loadLeases());
  const [bookings, setBookings] = useState<BookingReceipt[]>(() => loadBookings());
  const [facilities, setFacilities] = useState<Facility[]>(() => loadFacilities());
  const [juristicServices, setJuristicServices] = useState<JuristicServiceItem[]>(() => loadJuristicServices());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // Active Modals & Selection
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [selectedFacilityForModal, setSelectedFacilityForModal] = useState<Facility | null>(null);
  const [roomForHorizontalFlyer, setRoomForHorizontalFlyer] = useState<Room | null>(null);
  const [bookingModalState, setBookingModalState] = useState<{
    isOpen: boolean;
    room: Room | null;
    receipt: BookingReceipt | null;
  }>({
    isOpen: false,
    room: null,
    receipt: null
  });

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  }, []);

  // Sync to localStorage whenever state changes
  useEffect(() => {
    saveRooms(rooms);
  }, [rooms]);

  useEffect(() => {
    saveLeases(leases);
  }, [leases]);

  useEffect(() => {
    saveBookings(bookings);
  }, [bookings]);

  useEffect(() => {
    saveFacilities(facilities);
  }, [facilities]);

  useEffect(() => {
    saveJuristicServices(juristicServices);
  }, [juristicServices]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Initial cloud sync from Google Sheet if URL is configured
  // Architecture:
  // 1. อ่าน local cache เพื่อแสดงผลเร็วได้ (โหลดทันทีใน useState ตอนเริ่มต้น)
  // 2. โหลด Cloud (Google Sheet = Source of Truth)
  // 3. เปรียบเทียบ updatedAt ทุก entity (Rooms, Facilities, Bookings, Leases, Settings, Services)
  // 4. ใช้ข้อมูลล่าสุด (Cloud wins if cloudTime >= localTime; Local wins if localTime > cloudTime)
  // 5. Update local cache และ React state
  useEffect(() => {
    if (!settings.googleWebAppUrl) return;

    let isMounted = true;
    setIsSyncingGas(true);

    syncFromGas(settings.googleWebAppUrl).then((res) => {
      if (!isMounted) return;
      if (res.success) {
        if (res.rooms) setRooms(res.rooms);
        if (res.leases) setLeases(res.leases);
        if (res.bookings) setBookings(res.bookings);
        if (res.facilities) setFacilities(res.facilities);
        if (res.juristicServices) setJuristicServices(res.juristicServices);
        if (res.settings) {
          setSettings(prev => {
            const merged = mergeSettingsWithCloud(prev, res.settings!);
            saveSettings(merged);
            return merged;
          });
        }
      }
    }).catch((e) => {
      console.warn('Initial unified cloud sync notice:', e);
    }).finally(() => {
      if (isMounted) {
        setIsSyncingGas(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [settings.googleWebAppUrl]);

  // Deep Link Handling: Check URL params on initial load (e.g. ?room=room-1 or ?view=admin or ?receipt=BK-...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId) {
      const match = rooms.find(r => r.id === roomId);
      if (match) {
        setSelectedRoomForDetail(match);
      }
    }

    const receiptParam = params.get('receipt') || params.get('booking');
    if (receiptParam) {
      const match = bookings.find(b => b.id === receiptParam || (b.receiptNumber && b.receiptNumber.trim().toLowerCase() === receiptParam.trim().toLowerCase()));
      if (match) {
        const matchedRoom = rooms.find(r => r.id === match.roomId || (r.roomNumber && match.roomNumber && String(r.roomNumber).trim() === String(match.roomNumber).trim()));
        setBookingModalState({
          isOpen: true,
          room: matchedRoom || null,
          receipt: match
        });
      }
    }

    const viewParam = params.get('view');
    if (viewParam === 'admin') {
      if (localStorage.getItem('condohub_admin_session') === 'true' || sessionStorage.getItem('condohub_admin_session') === 'true') {
        setCurrentView('admin');
      } else {
        setIsLoginModalOpen(true);
      }
    }
  }, [rooms, bookings]);

  // Expiration calculation for Navbar badge
  const urgentLeaseCount = useMemo(() => {
    let count = 0;
    leases.forEach(l => {
      const { status } = calculateLeaseDaysAndStatus(l.endDate);
      if (status === 'expiring_30' || status === 'expiring_60') {
        count++;
      }
    });
    return count;
  }, [leases]);

  // Auth Handlers
  const handleLoginSuccess = (rememberMe: boolean = true) => {
    setIsAdminLoggedIn(true);
    if (rememberMe) {
      localStorage.setItem('condohub_admin_session', 'true');
    }
    sessionStorage.setItem('condohub_admin_session', 'true');
    setCurrentView('admin');
    showToast('ยินดีต้อนรับสู่ระบบบริหารจัดการคอนโดมิเนียม');
  };

  const handleLogout = () => {
    setIsAdminLoggedIn(false);
    localStorage.removeItem('condohub_admin_session');
    sessionStorage.removeItem('condohub_admin_session');
    setCurrentView('customer');
    showToast('ออกจากระบบเจ้าหน้าที่เรียบร้อยแล้ว', 'info');
  };

  // Share room link handler (Requirement: สามารถส่งลิงก์นี้ให้ลูกค้าดูได้)
  const handleShareRoom = (room: Room) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast(`คัดลอกลิงก์ห้อง ${room.roomNumber} (${room.condoName}) เรียบร้อยแล้ว สามารถส่งต่อให้ลูกค้าได้ทันที!`);
      }).catch(() => {
        prompt('คัดลอกลิงก์สำหรับส่งให้ลูกค้า:', shareUrl);
      });
    } else {
      prompt('คัดลอกลิงก์สำหรับส่งให้ลูกค้า:', shareUrl);
    }
  };

  // Room CRUD Handlers
  const handleSaveRoom = async (savedRoom: Room): Promise<boolean> => {
    // Ensure isPublished, status, and isTrash flags strictly match the defined rules:
    // โพสต์: status = "available", isPublished = true, isTrash = false
    // รอดำเนินการ: status = "pending", isPublished = false, isTrash = false
    // ติดสัญญา: status = "rented", isPublished = false, isTrash = false
    // ลบ: isTrash = true, isPublished = false
    const isTrash = savedRoom.isTrash === true || String(savedRoom.isTrash).toLowerCase() === 'true';
    let status = (savedRoom.status || 'available').trim().toLowerCase() as RoomStatus;
    let isPublished = false;

    if (isTrash) {
      isPublished = false;
    } else if (status === 'rented') {
      isPublished = false;
    } else if (status === 'pending') {
      isPublished = false;
    } else {
      status = 'available';
      isPublished = savedRoom.isPublished === true || String(savedRoom.isPublished).toLowerCase() === 'true';
    }

    const normalizedRoom: Room = {
      ...savedRoom,
      status,
      isPublished,
      isTrash,
      updatedAt: new Date().toISOString()
    };

    // If Google Sheet is configured, persist to Google Sheet first and verify response
    if (settings.googleWebAppUrl) {
      try {
        const cloudRes = await saveRoomToGas(settings.googleWebAppUrl, normalizedRoom);
        if (cloudRes.success) {
          const roomToPersist = cloudRes.room || normalizedRoom;

          // 1. Update React state with confirmed room
          setRooms(prev => {
            const index = prev.findIndex(r => r.id === roomToPersist.id || (r.roomNumber && String(r.roomNumber).trim() === String(roomToPersist.roomNumber).trim()));
            if (index >= 0) {
              const next = [...prev];
              next[index] = roomToPersist;
              return next;
            } else {
              return [roomToPersist, ...prev];
            }
          });

          // 2. Persist to localStorage synchronously
          const currentRooms = loadRooms();
          const existingIndex = currentRooms.findIndex(r => r.id === roomToPersist.id || (r.roomNumber && String(r.roomNumber).trim() === String(roomToPersist.roomNumber).trim()));
          let newRoomList: Room[];
          if (existingIndex >= 0) {
            newRoomList = [...currentRooms];
            newRoomList[existingIndex] = roomToPersist;
          } else {
            newRoomList = [roomToPersist, ...currentRooms];
          }
          saveRooms(newRoomList);

          showToast(`บันทึกข้อมูลห้อง ${roomToPersist.roomNumber} ขึ้น Google Sheets สำเร็จเรียบร้อย`, 'success');
          return true;
        } else {
          showToast(`บันทึกข้อมูลห้อง ${normalizedRoom.roomNumber} ไม่สำเร็จ: ${cloudRes.error || 'Google Sheet ขัดข้อง'}`, 'error');
          return false;
        }
      } catch (err: any) {
        showToast(`ส่งข้อมูลขึ้น Google Sheet ขัดข้อง: ${err.message}`, 'error');
        return false;
      }
    } else {
      // Offline fallback when no Google Web App URL is configured
      setRooms(prev => {
        const index = prev.findIndex(r => r.id === normalizedRoom.id || (r.roomNumber && String(r.roomNumber).trim() === String(normalizedRoom.roomNumber).trim()));
        if (index >= 0) {
          const next = [...prev];
          next[index] = normalizedRoom;
          return next;
        } else {
          return [normalizedRoom, ...prev];
        }
      });

      const currentRooms = loadRooms();
      const existingIndex = currentRooms.findIndex(r => r.id === normalizedRoom.id || (r.roomNumber && String(r.roomNumber).trim() === String(normalizedRoom.roomNumber).trim()));
      const newRoomList = existingIndex >= 0 ? [...currentRooms] : [normalizedRoom, ...currentRooms];
      if (existingIndex >= 0) newRoomList[existingIndex] = normalizedRoom;
      saveRooms(newRoomList);

      showToast(`บันทึกข้อมูลห้อง ${normalizedRoom.roomNumber} สำเร็จ (ออฟไลน์)`, 'info');
      return true;
    }
  };

  const handleDeleteRoom = (id: string) => {
    recordDeletedEntityId(id);
    setRooms(prev => prev.filter(r => r.id !== id));
    if (settings.googleWebAppUrl) {
      deleteRoomFromGas(settings.googleWebAppUrl, id).catch((err) => {
        console.warn('Background room cloud delete note:', err);
      });
    }
    showToast('ลบห้องชุดเรียบร้อยแล้ว');
  };

  // Lease CRUD Handlers
  const handleSaveLease = (savedLease: Lease) => {
    const now = new Date().toISOString();
    const leaseToSave: Lease = {
      ...savedLease,
      createdAt: savedLease.createdAt || now,
      updatedAt: now
    };

    setLeases(prev => {
      const index = prev.findIndex(l => l.id === leaseToSave.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = leaseToSave;
        return next;
      } else {
        return [leaseToSave, ...prev];
      }
    });

    // Automatically update the associated room status to 'rented'
    if (leaseToSave.roomId) {
      setRooms(prev => prev.map(r => r.id === leaseToSave.roomId ? { ...r, status: 'rented', updatedAt: now } : r));
    }

    // Auto-sync directly to Google Sheet in background if URL is set
    if (settings.googleWebAppUrl) {
      saveLeaseToGas(settings.googleWebAppUrl, leaseToSave).catch((err) => {
        console.warn('Background lease cloud sync note:', err);
      });
    }

    showToast(`บันทึกสัญญาเช่าของ ${leaseToSave.tenantName} เรียบร้อยแล้ว`);
  };

  const handleDeleteLease = (id: string) => {
    recordDeletedEntityId(id);
    setLeases(prev => prev.filter(l => l.id !== id));
    if (settings.googleWebAppUrl) {
      deleteLeaseFromGas(settings.googleWebAppUrl, id).catch((err) => {
        console.warn('Background lease cloud delete note:', err);
      });
    }
    showToast('ลบสัญญาเช่าเรียบร้อยแล้ว');
  };

  // Booking Receipt Handlers (Flow: สร้างใบจอง -> Save จริง -> Google Sheet -> Response Success -> Update UI -> Refresh ใบจองยังอยู่)
  const handleSaveBooking = async (booking: BookingReceipt): Promise<boolean> => {
    const agentName = String(booking.recipientName || booking.agentName || '').trim();
    const recipientType = (booking.recipientType || (agentName.includes('เจ้าของ') ? 'owner' : 'juristic')) as any;
    const resolvedRecipientName = String(booking.recipientName || agentName || (recipientType === 'owner' ? 'เจ้าของห้องชุด' : (settings.agencyName || 'สำนักงานนิติบุคคล แบงค์คอก ฮอไรซอน ราม 60'))).trim();

    const now = new Date().toISOString();
    let bookingToPersist: BookingReceipt = {
      ...booking,
      id: booking.id || `bk-${Date.now()}`,
      receiptNumber: booking.receiptNumber || `BK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      bookingDate: booking.bookingDate || now.split('T')[0],
      condoName: booking.condoName || 'Bangkok Horizon Ram 60',
      bookingType: booking.bookingType || 'rent',
      recipientType,
      recipientName: resolvedRecipientName,
      agentName: resolvedRecipientName,
      terms: booking.terms || '',
      createdAt: booking.createdAt || now,
      updatedAt: now
    };

    // 1. ถ้ามี Google Web App URL ให้บันทึกขึ้น Google Sheet จริงก่อน
    if (settings.googleWebAppUrl) {
      try {
        const cloudRes = await saveBookingToGas(settings.googleWebAppUrl, bookingToPersist);
        if (!cloudRes.success) {
          showToast(`บันทึกใบจองลง Google Sheet ไม่สำเร็จ: ${cloudRes.error || ''}`, 'error');
          return false;
        }
        if (cloudRes.booking) {
          bookingToPersist = {
            ...bookingToPersist,
            ...cloudRes.booking,
            updatedAt: cloudRes.booking.updatedAt || bookingToPersist.updatedAt
          };
        }
      } catch (err: any) {
        showToast('การเชื่อมต่อ Google Apps Script ขัดข้อง: ' + (err.message || ''), 'error');
        return false;
      }
    }

    // 2. เมื่อ Cloud สำเร็จ (Response Success) จึงอัปเดต UI และ Local Cache
    setBookings(prev => {
      const index = prev.findIndex(b => b.id === bookingToPersist.id || (b.receiptNumber && b.receiptNumber === bookingToPersist.receiptNumber));
      let updated: BookingReceipt[];
      if (index >= 0) {
        updated = [...prev];
        updated[index] = bookingToPersist;
      } else {
        updated = [bookingToPersist, ...prev];
      }
      saveBookings(updated);
      return updated;
    });

    // Synchronously write to localStorage right now
    const currentLocals = loadBookings();
    const curIdx = currentLocals.findIndex(b => b.id === bookingToPersist.id || (b.receiptNumber && b.receiptNumber === bookingToPersist.receiptNumber));
    let nextLocals: BookingReceipt[];
    if (curIdx >= 0) {
      nextLocals = [...currentLocals];
      nextLocals[curIdx] = bookingToPersist;
    } else {
      nextLocals = [bookingToPersist, ...currentLocals];
    }
    saveBookings(nextLocals);

    // อัปเดตสถานะห้องที่เกี่ยวข้องเป็น pending
    if (bookingToPersist.roomId || bookingToPersist.roomNumber) {
      setRooms(prev => {
        const updatedRooms = prev.map(r => {
          const matchId = bookingToPersist.roomId && r.id === bookingToPersist.roomId;
          const matchNum = bookingToPersist.roomNumber && r.roomNumber && String(r.roomNumber).trim() === String(bookingToPersist.roomNumber).trim();
          if (matchId || matchNum) {
            return { ...r, status: 'pending' as RoomStatus, isPublished: false, updatedAt: now };
          }
          return r;
        });
        saveRooms(updatedRooms);
        return updatedRooms;
      });
    }

    // If modal is open for this receipt, update receipt in state
    setBookingModalState(prev => prev.isOpen ? { ...prev, receipt: bookingToPersist } : prev);
    showToast(`บันทึกใบจองเลขที่ ${bookingToPersist.receiptNumber} ลง Google Sheet สำเร็จเรียบร้อย`, 'success');
    return true;
  };

  const handleDeleteBooking = async (id: string): Promise<boolean> => {
    recordDeletedEntityId(id);
    if (settings.googleWebAppUrl) {
      try {
        const cloudRes = await deleteBookingFromGas(settings.googleWebAppUrl, id);
        if (!cloudRes.success) {
          showToast(cloudRes.error || 'ลบใบจองออกจาก Google Sheet ไม่สำเร็จ', 'error');
          return false;
        }
      } catch (err: any) {
        showToast('การเชื่อมต่อ Google Apps Script ขัดข้อง: ' + (err.message || ''), 'error');
        return false;
      }
    }

    setBookings(prev => {
      const updated = prev.filter(b => b.id !== id);
      saveBookings(updated);
      return updated;
    });

    showToast('ลบใบจองเรียบร้อยแล้ว');
    return true;
  };

  // Facility Handlers (Flow: Save Facility -> Cloud -> Google Sheet -> Success -> Update UI)
  const handleSaveFacility = async (savedFacility: Facility): Promise<boolean> => {
    const now = new Date().toISOString();
    let facilityToPersist: Facility = {
      ...savedFacility,
      images: Array.isArray(savedFacility.images)
        ? savedFacility.images.map(toDirectImageUrl).filter(Boolean)
        : [],
      rules: Array.isArray(savedFacility.rules) ? savedFacility.rules : [],
      createdAt: savedFacility.createdAt || now,
      updatedAt: now
    };

    // 1. ถ้าเชื่อมต่อ Google Web App ให้บันทึกลง Cloud (Google Drive + Google Sheet) ก่อน
    if (settings.googleWebAppUrl) {
      try {
        const cloudRes = await saveFacilityToGas(settings.googleWebAppUrl, facilityToPersist);
        if (!cloudRes.success) {
          showToast(cloudRes.error || "บันทึกข้อมูลส่วนกลางลง Google Sheet ไม่สำเร็จ", "error");
          return false;
        }
        if (cloudRes.facility) {
          facilityToPersist = {
            ...cloudRes.facility,
            updatedAt: cloudRes.facility.updatedAt || facilityToPersist.updatedAt
          };
        }
      } catch (err: any) {
        showToast("การเชื่อมต่อ Google Apps Script ขัดข้อง: " + (err.message || ""), "error");
        return false;
      }
    }

    // 2. เมื่อ Cloud สำเร็จ (Success) จึงอัปเดต UI และ Local Cache
    setFacilities(prev => {
      const idx = prev.findIndex(f => f.id === facilityToPersist.id);
      let updated: Facility[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = facilityToPersist;
      } else {
        updated = [facilityToPersist, ...prev];
      }
      saveFacilities(updated);
      return updated;
    });

    showToast(`บันทึกข้อมูลส่วนกลาง "${facilityToPersist.name}" เรียบร้อยแล้ว (อัปเดตลง Google Sheet สำเร็จ)`);
    return true;
  };

  const handleDeleteFacility = async (id: string): Promise<boolean> => {
    recordDeletedEntityId(id);
    if (settings.googleWebAppUrl) {
      try {
        const cloudRes = await deleteFacilityFromGas(settings.googleWebAppUrl, id);
        if (!cloudRes.success) {
          showToast(cloudRes.error || "ลบข้อมูลส่วนกลางออกจาก Google Sheet ไม่สำเร็จ", "error");
          return false;
        }
      } catch (err: any) {
        showToast("การเชื่อมต่อ Google Apps Script ขัดข้อง: " + (err.message || ""), "error");
        return false;
      }
    }

    setFacilities(prev => {
      const updated = prev.filter(f => f.id !== id);
      saveFacilities(updated);
      return updated;
    });

    showToast("ลบสิ่งอำนวยความสะดวกส่วนกลางเรียบร้อยแล้ว");
    return true;
  };

  // Juristic Services & Rental Rules Handlers
  const handleSaveJuristicService = (savedItem: JuristicServiceItem) => {
    const now = new Date().toISOString();
    const itemToSave: JuristicServiceItem = {
      ...savedItem,
      createdAt: savedItem.createdAt || now,
      updatedAt: now
    };

    setJuristicServices(prev => {
      const idx = prev.findIndex(s => s.id === itemToSave.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = itemToSave;
        return next;
      } else {
        return [itemToSave, ...prev];
      }
    });

    // Auto-sync directly to Google Sheet in background if URL is set
    if (settings.googleWebAppUrl) {
      saveJuristicServiceToGas(settings.googleWebAppUrl, itemToSave).catch((err) => {
        console.warn('Background juristic service cloud sync note:', err);
      });
    }

    showToast(`บันทึกข้อมูล "${itemToSave.title}" เรียบร้อยแล้ว`);
  };

  const handleDeleteJuristicService = (id: string) => {
    recordDeletedEntityId(id);
    setJuristicServices(prev => prev.filter(s => s.id !== id));
    if (settings.googleWebAppUrl) {
      deleteJuristicServiceFromGas(settings.googleWebAppUrl, id).catch((err) => {
        console.warn('Background juristic service cloud delete note:', err);
      });
    }
    showToast('ลบรายการบริการ / ระเบียบเรียบร้อยแล้ว');
  };

  // Settings Update Handler (Cloud is Source of Truth)
  const handleUpdateSettings = async (newSettings: AppSettings): Promise<boolean> => {
    const updatedSettings: AppSettings = {
      ...newSettings,
      updatedAt: new Date().toISOString()
    };

    // 1. Save Local Cache
    saveSettings(updatedSettings);
    setSettings(updatedSettings);

    // 2. Save Google Sheet จริง
    if (updatedSettings.googleWebAppUrl) {
      try {
        const res = await syncSettingsToGas(updatedSettings.googleWebAppUrl, updatedSettings);
        // 3. ตรวจ response.success
        if (res.success) {
          const confirmed = mergeSettingsWithCloud(updatedSettings, res.settings || {});
          saveSettings(confirmed);
          setSettings(confirmed);
          showToast('บันทึกการตั้งค่าลง Google Sheet สำเร็จแล้ว', 'success');
          return true;
        } else {
          showToast(`บันทึก Google Sheet ไม่สำเร็จ: ${res.message || 'เกิดข้อผิดพลาด'}`, 'error');
          return false;
        }
      } catch (err: any) {
        showToast('การเชื่อมต่อ Google Apps Script ขัดข้อง: ' + (err.message || ''), 'error');
        return false;
      }
    }

    showToast('บันทึกการตั้งค่าระบบเรียบร้อย');
    return true;
  };

  // GAS Integration Handlers
  const handleTestGasConnection = async (url: string) => {
    const res = await testGasConnection(url);
    if (res.success) {
      showToast(res.message);
    } else {
      showToast(res.message, 'error');
    }
    return res;
  };

  const handleSyncGas = async () => {
    if (!settings.googleWebAppUrl) {
      showToast('กรุณาระบุ Web App URL ก่อนทำการซิงค์', 'error');
      return;
    }
    if (isSyncingGas) return;
    setIsSyncingGas(true);
    showToast('กำลังซิงค์ข้อมูลกับ Google Sheets...', 'info');
    try {
      // Smart bidirectional sync: Cloud = Source of Truth, LocalStorage = Cache
      // Pulls Cloud, compares updatedAt for every entity, pushes only newer local edits, updates cache
      const res = await syncFromGas(settings.googleWebAppUrl);
      if (res.success) {
        if (res.rooms) setRooms(res.rooms);
        if (res.leases) setLeases(res.leases);
        if (res.bookings) setBookings(res.bookings);
        if (res.facilities) setFacilities(res.facilities);
        if (res.juristicServices) setJuristicServices(res.juristicServices);
        if (res.settings) {
          setSettings(prev => {
            const merged = mergeSettingsWithCloud(prev, res.settings!);
            saveSettings(merged);
            return merged;
          });
        }
        showToast('ซิงค์ข้อมูลกับ Google Sheets สำเร็จแล้ว (อัปเดตตรงกัน 100%)', 'success');
      } else {
        showToast(`การซิงค์ขัดข้อง: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`การซิงค์ขัดข้อง: ${err.message || 'เกิดข้อผิดพลาด'}`, 'error');
    } finally {
      setIsSyncingGas(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F5] text-stone-900 selection:bg-stone-800 selection:text-stone-100 font-sans">
      
      {/* Main View Router: Customer View vs Admin Portal */}
      <main className="flex-1">
        {currentView === 'customer' ? (
          <CustomerView
            rooms={rooms}
            facilities={facilities}
            juristicServices={juristicServices}
            onSelectRoom={(room) => setSelectedRoomForDetail(room)}
            onShareRoom={handleShareRoom}
            onSelectFacility={(fac) => setSelectedFacilityForModal(fac)}
            onOpenStaffLogin={() => setIsLoginModalOpen(true)}
            isAdminLoggedIn={isAdminLoggedIn}
            onBackToAdmin={() => setCurrentView('admin')}
            contactLine={settings.defaultContactLine}
            contactPhone={settings.defaultContactPhone}
            agencyName={settings.agencyName}
            heroBackgroundImages={settings.heroBackgroundImages}
          />
        ) : (
          <AdminPortal
            rooms={rooms}
            leases={leases}
            bookings={bookings}
            facilities={facilities}
            juristicServices={juristicServices}
            settings={settings}
            onBackToCustomer={() => setCurrentView('customer')}
            onLogout={handleLogout}
            onSaveRoom={handleSaveRoom}
            onDeleteRoom={handleDeleteRoom}
            onSaveLease={handleSaveLease}
            onDeleteLease={handleDeleteLease}
            onSaveBooking={handleSaveBooking}
            onSaveFacility={handleSaveFacility}
            onDeleteFacility={handleDeleteFacility}
            onSaveJuristicService={handleSaveJuristicService}
            onDeleteJuristicService={handleDeleteJuristicService}
            onUpdateSettings={handleUpdateSettings}
            onOpenHorizontalFlyer={(room) => setRoomForHorizontalFlyer(room)}
            onOpenBookingReceipt={(room, receipt) => {
              const matchedRoom = room || (receipt ? rooms.find(r => r.id === receipt.roomId || (r.roomNumber && receipt.roomNumber && String(r.roomNumber).trim() === String(receipt.roomNumber).trim())) : null);
              setBookingModalState({
                isOpen: true,
                room: matchedRoom || null,
                receipt: receipt || null
              });
            }}
            onTestGasConnection={handleTestGasConnection}
            onSyncGas={handleSyncGas}
            onNotify={showToast}
          />
        )}
      </main>

      {/* Facility Detail Modal (Popup for facilities images & info) */}
      {selectedFacilityForModal && (
        <FacilityDetailModal
          facility={selectedFacilityForModal}
          onClose={() => setSelectedFacilityForModal(null)}
          contactLine={settings.defaultContactLine}
          contactPhone={settings.defaultContactPhone}
        />
      )}

      {/* Room Detail Modal (Photo gallery, specs, amenities, contact, share) */}
      {selectedRoomForDetail && (
        <RoomDetailModal
          room={selectedRoomForDetail}
          onClose={() => setSelectedRoomForDetail(null)}
          onShareRoom={handleShareRoom}
          isAdminLoggedIn={isAdminLoggedIn}
          onOpenHorizontalFlyer={(room) => {
            setSelectedRoomForDetail(null);
            setRoomForHorizontalFlyer(room);
          }}
          onOpenBookingReceipt={(room) => {
            setSelectedRoomForDetail(null);
            setBookingModalState({
              isOpen: true,
              room: room,
              receipt: null
            });
          }}
          onEditRoom={(_room) => {
            setSelectedRoomForDetail(null);
            setCurrentView('admin');
          }}
          onChangeStatus={(room, newStatus) => {
            handleSaveRoom({
              ...room,
              status: newStatus,
              isPublished: newStatus === 'available'
            });
            showToast(`เปลี่ยนสถานะห้อง ${room.roomNumber} เรียบร้อยแล้ว`);
          }}
          settings={settings}
          lease={leases.find(l => (l.roomId && l.roomId === selectedRoomForDetail.id) || (l.roomNumber && l.roomNumber.trim().toLowerCase() === selectedRoomForDetail.roomNumber.trim().toLowerCase()))}
          bookings={bookings.filter(b => (b.roomId && b.roomId === selectedRoomForDetail.id) || (b.roomNumber && b.roomNumber.trim().toLowerCase() === selectedRoomForDetail.roomNumber.trim().toLowerCase()))}
          onViewBookingReceipt={(receipt) => {
            setSelectedRoomForDetail(null);
            setBookingModalState({
              isOpen: true,
              room: selectedRoomForDetail,
              receipt: receipt
            });
          }}
          facilities={facilities}
          onSelectFacility={(fac) => setSelectedFacilityForModal(fac)}
        />
      )}

      {/* Horizontal Room Flyer Modal (Requirement: รูปแนวนอน, เซฟเป็นรูปภาพ, เซฟเป็น PDF, ปริ้นออกเครื่องปริ้น) */}
      {roomForHorizontalFlyer && (
        <HorizontalRoomFlyerModal
          room={roomForHorizontalFlyer}
          settings={settings}
          onClose={() => setRoomForHorizontalFlyer(null)}
          onNotify={showToast}
        />
      )}

      {/* Booking Receipt Modal (Requirement: ออกใบจองห้อง, ทำเป็น PDF, ปริ้น) */}
      {bookingModalState.isOpen && (
        <BookingReceiptModal
          selectedRoom={bookingModalState.room}
          receipt={bookingModalState.receipt}
          settings={settings}
          onSaveReceipt={handleSaveBooking}
          onClose={() => setBookingModalState({ isOpen: false, room: null, receipt: null })}
          onNotify={showToast}
        />
      )}

      {/* Staff Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        correctEmail={settings.adminEmail || 'nitibangkok.horizon@gmail.com'}
        correctPassword={settings.adminPassword || '7014'}
        onNotify={showToast}
      />

      {/* Google Sheet Sync Floating Progress Indicator */}
      {isSyncingGas && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-60 bg-stone-900 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 border border-stone-700 animate-in fade-in slide-in-from-top-4">
          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs sm:text-sm font-semibold tracking-wide">
            กำลังซิงค์ข้อมูลกับ Google Sheets...
          </span>
        </div>
      )}

      {/* Notification Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

    </div>
  );
}
