/**
 * ==========================================================================
 * Bangkok Horizon Ram 60 - Google Apps Script Backend (API + Auto Setup Database & Drive)
 * ==========================================================================
 * 
 * คุณสมบัติเด่น:
 * 1. ระบบสร้างโฟลเดอร์ Google Drive ("BangkokHorizonRam60_Storage") อัตโนมัติในคลิกเดียว
 * 2. ระบบสร้างไฟล์ Google Sheet ("BangkokHorizonRam60_Database") พร้อมสร้างแท็บและหัวตารางอัตโนมัติ:
 *    - Rooms (ห้องชุด)
 *    - Leases (สัญญาเช่าและผู้เช่า)
 *    - Bookings (ใบจองห้อง)
 *    - Facilities (สิ่งอำนวยความสะดวกส่วนกลาง)
 *    - JuristicServices (บริการนิติบุคคล & ระเบียบการเช่า)
 *    - Settings (การตั้งค่าระบบและรหัสผ่านแอดมิน)
 * 3. ไม่ต้องกรอก Folder ID หรือ Sheet ID เอง ระบบจำค่าใน ScriptProperties ให้อัตโนมัติ!
 * 4. รองรับการอัปโหลดรูปภาพและไฟล์สัญญาเช่าลง Google Drive โดยตรง
 * 5. รองรับ CORS และ JSON API ให้ Frontend เรียกใช้งานได้ 100%
 */

const FOLDER_NAME = "BangkokHorizonRam60_Storage";
const SPREADSHEET_NAME = "BangkokHorizonRam60_Database";

// --------------------------------------------------------------------------
// 1. WEB APP ENTRY POINTS (GET / POST)
// --------------------------------------------------------------------------

function doGet(e) {
  return handleRequest(e, "GET");
}

function doPost(e) {
  return handleRequest(e, "POST");
}

function handleRequest(e, method) {
  try {
    var params = {};
    if (e && e.parameter) {
      params = e.parameter;
    }
    
    // Parse JSON body for POST if available
    var postData = null;
    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (err) {
        // Fallback for form-encoded
        postData = e.parameter;
      }
    }

    var payload = postData || params;
    var action = payload.action || params.action || "ping";

    var result = {};

    switch (action) {
      case "ping":
      case "status":
        result = getSystemStatus();
        break;

      case "setup":
        result = setupProject();
        break;

      // --- Rooms ---
      case "getRooms":
        result = { success: true, data: getRoomsData() };
        break;

      case "saveRoom":
        result = saveRoomData(payload.room);
        break;

      case "deleteRoom":
        result = deleteRoomData(payload.id);
        break;

      // --- Leases ---
      case "getLeases":
        result = { success: true, data: getLeasesData() };
        break;

      case "saveLease":
        result = saveLeaseData(payload.lease);
        break;

      case "deleteLease":
        result = deleteLeaseData(payload.id);
        break;

      // --- Bookings ---
      case "getBookings":
        result = { success: true, data: getBookingsData() };
        break;

      case "saveBooking":
        result = saveBookingData(payload.booking);
        break;

      case "deleteBooking":
        result = deleteBookingData(payload.id);
        break;

      // --- Facilities (สิ่งอำนวยความสะดวกส่วนกลาง) ---
      case "getFacilities":
        result = { success: true, data: getFacilitiesData() };
        break;

      case "saveFacility":
        result = saveFacilityData(payload.facility);
        break;

      case "deleteFacility":
        result = deleteFacilityData(payload.id);
        break;

      case "saveFacilities":
        result = saveFacilitiesBulk(payload.facilities);
        break;

      // --- Juristic Services & Rules (บริการนิติ & ระเบียบการเช่า) ---
      case "getJuristicServices":
        result = { success: true, data: getJuristicServicesData() };
        break;

      case "saveJuristicService":
        result = saveJuristicServiceData(payload.service);
        break;

      case "deleteJuristicService":
        result = deleteJuristicServiceData(payload.id);
        break;

      case "saveJuristicServices":
        result = saveJuristicServicesBulk(payload.services);
        break;

      // --- Drive Storage ---
      case "uploadFile":
        result = uploadFileToDrive(payload.base64Data, payload.fileName, payload.mimeType, payload.roomNumber, payload.subfolderType);
        break;

      case "getRoomFolder":
        var f = getOrCreateRoomFolder(payload.roomNumber, payload.subfolderType);
        result = {
          success: true,
          folderName: f.getName(),
          folderUrl: f.getUrl()
        };
        break;

      // --- Full Sync ---
      case "syncAll":
        result = {
          success: true,
          rooms: getRoomsData(),
          leases: getLeasesData(),
          bookings: getBookingsData(),
          facilities: getFacilitiesData(),
          juristicServices: getJuristicServicesData(),
          settings: getSettingsData()
        };
        break;

      // --- Settings ---
      case "getSettings":
        result = {
          success: true,
          settings: getSettingsData()
        };
        break;

      case "saveSettings":
        result = saveSettingsData(payload.settings);
        break;

      default:
        result = { success: false, error: "Action not recognized: " + action };
        break;
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// --------------------------------------------------------------------------
// 2. AUTO-SETUP: สร้าง GOOGLE DRIVE FOLDER & GOOGLE SHEET อัตโนมัติ 100%
// --------------------------------------------------------------------------

function setupProject() {
  var scriptProperties = PropertiesService.getScriptProperties();
  
  // 1. ตรวจสอบหรือสร้าง Google Drive Folder
  var folder = getOrCreateFolder(FOLDER_NAME);
  var folderId = folder.getId();
  var folderUrl = folder.getUrl();
  scriptProperties.setProperty("FOLDER_ID", folderId);

  // 2. ตรวจสอบหรือสร้าง Google Sheet ภายในโฟลเดอร์นั้น
  var spreadsheet = getOrCreateSpreadsheet(folder, SPREADSHEET_NAME);
  var spreadsheetId = spreadsheet.getId();
  var spreadsheetUrl = spreadsheet.getUrl();
  scriptProperties.setProperty("SPREADSHEET_ID", spreadsheetId);

  // 3. กำหนดโครงสร้างแท็บและหัวตาราง
  initSheetTabs(spreadsheet);

  return {
    success: true,
    message: "ตั้งค่าระบบสำเร็จ! สร้าง Google Drive Folder และ Google Sheet ให้เรียบร้อยแล้ว",
    folderId: folderId,
    folderUrl: folderUrl,
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: spreadsheetUrl
  };
}

function getSystemStatus() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var folderId = props.FOLDER_ID;
  var spreadsheetId = props.SPREADSHEET_ID;

  var status = {
    success: true,
    configured: false,
    folderId: folderId || null,
    spreadsheetId: spreadsheetId || null,
    message: "Google Apps Script Backend พร้อมใช้งาน"
  };

  if (folderId && spreadsheetId) {
    try {
      var sheet = SpreadsheetApp.openById(spreadsheetId);
      status.configured = true;
      status.spreadsheetUrl = sheet.getUrl();
      status.spreadsheetName = sheet.getName();
    } catch (e) {
      status.configured = false;
      status.note = "ยังไม่พบ Spreadsheet หรือยังไม่ได้รัน setupProject()";
    }
  }

  return status;
}

function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  var newFolder = DriveApp.createFolder(folderName);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

function getOrCreateSpreadsheet(folder, sheetName) {
  var files = folder.getFilesByName(sheetName);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  var ss = SpreadsheetApp.create(sheetName);
  var file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return ss;
}

// ==========================================================================
// CANONICAL ROOM SCHEMA & DYNAMIC HEADER MAPPING
// รองรับทุก 37 ฟิลด์ตาม src/types.ts และใช้ระบบ Dynamic Header Mapping
// ==========================================================================

var ROOM_FIELD_SPECS = [
  { key: "id", header: "ID", type: "string", aliases: ["id", "roomid"] },
  { key: "roomNumber", header: "RoomNumber", type: "string", aliases: ["roomnumber", "room_number", "roomno", "room#", "เลขห้อง"] },
  { key: "condoName", header: "CondoName", type: "string", aliases: ["condoname", "condo_name", "condo", "ชื่อโครงการ", "ชื่อคอนโด"] },
  { key: "listingType", header: "ListingType", type: "string", defaultVal: "rent", aliases: ["listingtype", "listing_type", "type", "ประเภทสัญญา"] },
  { key: "rentPrice", header: "RentPrice", type: "number", defaultVal: 0, aliases: ["rentprice", "rent_price", "rent", "ราคาเช่า"] },
  { key: "salePrice", header: "SalePrice", type: "number", defaultVal: 0, aliases: ["saleprice", "sale_price", "sale", "ราคาขาย"] },
  { key: "sizeCategory", header: "SizeCategory", type: "string", defaultVal: "small", aliases: ["sizecategory", "size_category", "size", "กลุ่มขนาด"] },
  { key: "areaSqM", header: "AreaSqM", type: "number", defaultVal: 0, aliases: ["areasqm", "area_sqm", "area", "ขนาดพื้นที่", "ตารางเมตร"] },
  { key: "floor", header: "Floor", type: "string", defaultVal: "", aliases: ["floor", "ชั้น"] },
  { key: "building", header: "Building", type: "string", defaultVal: "", aliases: ["building", "ตึก", "อาคาร"] },
  { key: "bedrooms", header: "Bedrooms", type: "number", defaultVal: 0, aliases: ["bedrooms", "bedroom", "ห้องนอน"] },
  { key: "bathrooms", header: "Bathrooms", type: "number", defaultVal: 1, aliases: ["bathrooms", "bathroom", "ห้องน้ำ"] },
  { key: "facingDirection", header: "FacingDirection", type: "string", defaultVal: "", aliases: ["facingdirection", "facing_direction", "direction", "ทิศ"] },
  { key: "viewType", header: "ViewType", type: "string", defaultVal: "", aliases: ["viewtype", "view_type", "วิว", "ประเภทวิว"] },
  { key: "viewDescription", header: "ViewDescription", type: "string", defaultVal: "", aliases: ["viewdescription", "view_description", "รายละเอียดวิว"] },
  { key: "sunlightExposure", header: "SunlightExposure", type: "string", defaultVal: "", aliases: ["sunlightexposure", "sunlight_exposure", "แดด", "ทิศทางแดด"] },
  { key: "floorViewLevel", header: "FloorViewLevel", type: "string", defaultVal: "", aliases: ["floorviewlevel", "floor_view_level", "viewlevel", "ระดับชั้นวิว"] },
  { key: "status", header: "Status", type: "status", defaultVal: "available", aliases: ["status", "สถานะ"] },
  { key: "isPublished", header: "IsPublished", type: "boolean", defaultVal: false, aliases: ["ispublished", "is_published", "published", "สถานะโพสต์", "โพสต์"] },
  { key: "isTrash", header: "IsTrash", type: "boolean", defaultVal: false, aliases: ["istrash", "is_trash", "trash", "ถังขยะ"] },
  { key: "trashedAt", header: "TrashedAt", type: "date", defaultVal: "", aliases: ["trashedat", "trashed_at"] },
  { key: "staffNotes", header: "StaffNotes", type: "string", defaultVal: "", aliases: ["staffnotes", "staff_notes", "staffnote", "โน้ตเจ้าหน้าที่", "โน้ตลับ"] },
  { key: "ownerName", header: "OwnerName", type: "string", defaultVal: "", aliases: ["ownername", "owner_name", "owner", "ชื่อเจ้าของ"] },
  { key: "ownerPhone", header: "OwnerPhone", type: "string", defaultVal: "", aliases: ["ownerphone", "owner_phone", "เบอร์เจ้าของ"] },
  { key: "ownerContractDocUrl", header: "OwnerContractDocUrl", type: "string", defaultVal: "", aliases: ["ownercontractdocurl", "owner_contract_doc_url", "contractdocurl", "ลิงก์สัญญาเจ้าของ"] },
  { key: "ownerContractDocName", header: "OwnerContractDocName", type: "string", defaultVal: "", aliases: ["ownercontractdocname", "owner_contract_doc_name", "contractdocname", "ชื่อไฟล์สัญญาเจ้าของ"] },
  { key: "ownerNotes", header: "OwnerNotes", type: "string", defaultVal: "", aliases: ["ownernotes", "owner_notes", "ownernote", "โน้ตเจ้าของ"] },
  { key: "description", header: "Description", type: "string", defaultVal: "", aliases: ["description", "รายละเอียด"] },
  { key: "highlights", header: "Highlights", type: "json_array", aliases: ["highlights", "จุดเด่น"] },
  { key: "amenities", header: "Amenities", type: "json_array", aliases: ["amenities", "สิ่งอำนวยความสะดวก"] },
  { key: "images", header: "Images", type: "json_array", aliases: ["images", "รูปภาพ"] },
  { key: "floorPlanImage", header: "FloorPlanImage", type: "string", defaultVal: "", aliases: ["floorplanimage", "floor_plan_image", "floorplan", "แปลนห้อง"] },
  { key: "contactName", header: "ContactName", type: "string", defaultVal: "", aliases: ["contactname", "contact_name", "ผู้ติดต่อ"] },
  { key: "contactPhone", header: "ContactPhone", type: "string", defaultVal: "", aliases: ["contactphone", "contact_phone", "เบอร์ติดต่อ"] },
  { key: "contactLine", header: "ContactLine", type: "string", defaultVal: "", aliases: ["contactline", "contact_line", "ไลน์ติดต่อ"] },
  { key: "createdAt", header: "CreatedAt", type: "date", aliases: ["createdat", "created_at", "สร้างเมื่อ"] },
  { key: "updatedAt", header: "UpdatedAt", type: "date", aliases: ["updatedat", "updated_at", "อัปเดตเมื่อ"] }
];

/**
 * ปรับชื่อหัวตารางให้เป็นมาตรฐานสำหรับการเปรียบเทียบ (ลบช่องว่าง, _, -, #, ตัวพิมพ์เล็ก)
 */
function normalizeHeaderName(str) {
  if (str === undefined || str === null) return "";
  return String(str).toLowerCase().replace(/[\s_\-#]+/g, "");
}

/**
 * สร้าง Map ระหว่าง field key -> column index (0-based) โดยตรวจจับทั้งชื่อมาตรฐานและ aliases
 */
function buildHeaderMap(headers) {
  var map = {};
  var headerNormalized = [];
  for (var c = 0; c < headers.length; c++) {
    headerNormalized.push(normalizeHeaderName(headers[c]));
  }

  var missingSpecs = [];
  for (var s = 0; s < ROOM_FIELD_SPECS.length; s++) {
    var spec = ROOM_FIELD_SPECS[s];
    var matchedIndex = -1;

    var canonNorm = normalizeHeaderName(spec.header);
    for (var c = 0; c < headerNormalized.length; c++) {
      if (headerNormalized[c] === canonNorm) {
        matchedIndex = c;
        break;
      }
    }

    if (matchedIndex === -1 && spec.aliases) {
      for (var a = 0; a < spec.aliases.length; a++) {
        var aliasNorm = normalizeHeaderName(spec.aliases[a]);
        for (var c = 0; c < headerNormalized.length; c++) {
          if (headerNormalized[c] === aliasNorm) {
            matchedIndex = c;
            break;
          }
        }
        if (matchedIndex !== -1) break;
      }
    }

    if (matchedIndex !== -1) {
      map[spec.key] = matchedIndex;
    } else {
      missingSpecs.push(spec);
    }
  }

  return {
    map: map,
    missingSpecs: missingSpecs
  };
}

/**
 * ตรวจสอบและสร้าง/อัปเดตคอลัมน์ของชีต Rooms โดยอัตโนมัติ
 * หากพบว่ามีคอลัมน์ใดขาดหายไป จะต่อท้ายคอลัมน์ใหม่ให้โดยอัตโนมัติ ไม่ต้องแก้ชีตเอง!
 */
function ensureRoomSheetHeaders(sheet) {
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    var allHeaders = ROOM_FIELD_SPECS.map(function(s) { return s.header; });
    sheet.appendRow(allHeaders);
    var range = sheet.getRange(1, 1, 1, allHeaders.length);
    range.setBackground("#1e293b");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    sheet.setFrozenRows(1);
    return {
      headers: allHeaders,
      map: buildHeaderMap(allHeaders).map
    };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var hmInfo = buildHeaderMap(headers);

  // หากมีคอลัมน์ใหม่ที่ยังไม่มีใน Google Sheet ให้สร้างต่อท้ายให้อัตโนมัติทันที
  if (hmInfo.missingSpecs && hmInfo.missingSpecs.length > 0) {
    var newHeaders = hmInfo.missingSpecs.map(function(s) { return s.header; });
    var startCol = lastCol + 1;
    sheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
    var newRange = sheet.getRange(1, startCol, 1, newHeaders.length);
    newRange.setBackground("#1e293b");
    newRange.setFontColor("#ffffff");
    newRange.setFontWeight("bold");

    var updatedLastCol = lastCol + newHeaders.length;
    headers = sheet.getRange(1, 1, 1, updatedLastCol).getValues()[0];
    hmInfo = buildHeaderMap(headers);
  }

  return {
    headers: headers,
    map: hmInfo.map
  };
}

function initSheetTabs(ss) {
  // แท็บ 1: Rooms (ข้อมูลห้อง) - ใช้ ensureRoomSheetHeaders สร้างหรืออัปเดตคอลัมน์อัตโนมัติ
  var roomSheet = ss.getSheetByName("Rooms");
  if (!roomSheet) {
    roomSheet = ss.insertSheet("Rooms");
  }
  ensureRoomSheetHeaders(roomSheet);

  // แท็บ 2: Leases (สัญญาเช่าและผู้เช่า)
  var leaseHeaders = [
    "ID", "RoomID", "RoomNumber", "CondoName", "TenantName", "TenantPhone",
    "TenantEmail", "TenantIdCard", "StartDate", "EndDate", "MonthlyRent",
    "DepositAmount", "AdvanceRent", "Status", "ContractUrl", "Notes", "UpdatedAt"
  ];
  ensureSheetWithHeaders(ss, "Leases", leaseHeaders);

  // แท็บ 3: Bookings (ใบจองห้อง)
  ensureBookingSheet(ss);

  // แท็บ 4: Facilities (ข้อมูลส่วนกลาง)
  ensureFacilitiesSheet(ss);

  // แท็บ 5: JuristicServices (บริการนิติบุคคล & ระเบียบการเช่า)
  var serviceHeaders = [
    "ID", "Category", "Title", "Description", "Badge", "Icon",
    "Details", "HoursOrContact", "UpdatedAt"
  ];
  var serviceSheet = ensureSheetWithHeaders(ss, "JuristicServices", serviceHeaders);
  if (serviceSheet.getLastRow() <= 1) {
    seedDefaultServices(serviceSheet);
  }

  // แท็บ 6: Settings (การตั้งค่าระบบและรหัสผ่านแอดมิน)
  var settingsHeaders = ["Key", "Value", "Description", "UpdatedAt"];
  var settingsSheet = ensureSheetWithHeaders(ss, "Settings", settingsHeaders);
  if (settingsSheet.getLastRow() <= 1) {
    var nowStr = new Date().toISOString();
    settingsSheet.appendRow(["adminPassword", "7014", "รหัสผ่าน / PIN เจ้าหน้าที่สำหรับเข้าสู่ระบบ", nowStr]);
    settingsSheet.appendRow(["adminEmail", "nitibangkok.horizon@gmail.com", "อีเมลเจ้าหน้าที่แอดมิน", nowStr]);
    settingsSheet.appendRow(["agencyName", "Bangkok Horizon Ram 60 (นิติบุคคลอาคารชุด)", "ชื่อโครงการหรือหน่วยงาน", nowStr]);
    settingsSheet.appendRow(["defaultContactPhone", "02-735-6060", "เบอร์โทรศัพท์ติดต่อ", nowStr]);
    settingsSheet.appendRow(["defaultContactLine", "@052adooe", "LINE Official Account", nowStr]);
    settingsSheet.appendRow(["agencyAddress", "สำนักงานนิติบุคคลอาคารชุด แบงค์คอก ฮอไรซอน รามคำแหง 60 ซ.รามคำแหง 60 แขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ 10240", "ที่อยู่โครงการ", nowStr]);
  }

  // ลบ Sheet1 เริ่มต้นถ้ามี
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }
}

function ensureSheetWithHeaders(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setBackground("#1e293b");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function seedDefaultFacilities(sheet) {
  var nowStr = new Date().toISOString();
  var defaults = [
    [
      "fac-1",
      "สระว่ายน้ำในร่ม & จากุซซี่",
      "Indoor Swimming Pool & Jacuzzi",
      "ชั้น 8",
      "สระว่ายน้ำระบบเกลือในร่ม ความยาวมาตรฐาน ไม่ต้องกังวลเรื่องแดดหรือฝน สามารถว่ายน้ำออกกำลังกายได้ตลอดทั้งวัน พร้อมโซนเตียงจากุซซี่นวดผ่อนคลายกล้ามเนื้อ และเก้าอี้พักผ่อนริมสระ",
      "06:00 - 22:00 น. (เปิดทุกวัน)",
      "[]",
      JSON.stringify([
        "กรุณาสวมใส่ชุดว่ายน้ำที่ถูกต้องก่อนลงสระ",
        "อาบน้ำชำระร่างกาย ณ จุดล้างตัวก่อนลงสระทุกครั้ง",
        "เด็กอายุต่ำกว่า 12 ปี ต้องมีผู้ปกครองดูแลอย่างใกล้ชิด",
        "ห้ามนำอาหารและเครื่องดื่มทุกชนิดมารับประทานบริเวณริมสระ"
      ]),
      "pool",
      nowStr
    ],
    [
      "fac-2",
      "ฟิตเนสเซ็นเตอร์ & ห้องซาวน่า",
      "Fitness Center & Sauna Rooms",
      "ชั้น 8",
      "ห้องออกกำลังกายอุปกรณ์ครบครัน ทั้งโซนคาร์ดิโอ (ลู่วิ่งไฟฟ้า, เครื่องปั่นจักรยาน, Elliptical) และโซนเวทเทรนนิ่ง ดัมเบลล์หลากขนาด ม้านั่งปรับระดับ พร้อมห้องซาวน่าแยกชาย-หญิง สำหรับการฟื้นฟูร่างกายหลังออกกำลังกาย",
      "06:00 - 22:00 น. (เปิดทุกวัน)",
      "[]",
      JSON.stringify([
        "กรุณาสวมรองเท้าผ้าใบและชุดออกกำลังกายที่เหมาะสม",
        "นำผ้าขนหนูมาซับเหงื่อและเช็ดทำความสะอาดอุปกรณ์หลังใช้งาน",
        "จำกัดเวลาใช้งานเครื่องคาร์ดิโอไม่เกิน 30 นาที/ท่าน ในช่วงเวลาเร่งด่วน",
        "ปิดสวิตช์ซาวน่าและอุปกรณ์หลังการใช้งานเสร็จสิ้น"
      ]),
      "fitness",
      nowStr
    ],
    [
      "fac-3",
      "สวนลอยฟ้า Sky Garden & 360° Lounge",
      "Sky Garden & 360° Panoramic View",
      "ชั้น 35 - 37",
      "จุดชมวิวแลนด์มาร์กของโครงการ แบงค์คอก ฮอไรซอน รามคำแหง 60 ชมทัศนียภาพกรุงเทพฯ แบบ 360 องศา สัมผัสลมธรรมชาติและแสงดาวยามค่ำคืน มีพื้นที่สวนหย่อมลอยฟ้าและมุมที่นั่งพักผ่อนสังสรรค์อย่างสงบ",
      "06:00 - 23:00 น. (เปิดทุกวัน)",
      "[]",
      JSON.stringify([
        "ห้ามส่งเสียงดังรบกวนลูกบ้านท่านอื่น",
        "ห้ามสูบบุหรี่ หรือนำเครื่องดื่มแอลกอฮอล์ขึ้นมาบนสวนลอยฟ้า",
        "ช่วยกันรักษาความสะอาด และนำขยะทิ้งในจุดที่จัดไว้",
        "ห้ามปีนป่ายรั้วกันตกหรือกระจกนิรภัยเด็ดขาด"
      ]),
      "garden",
      nowStr
    ],
    [
      "fac-4",
      "โถงล็อบบี้เพดานสูง & ห้องรับรอง",
      "Grand High-Ceiling Lobby & Lounge",
      "ชั้น 1",
      "โถงต้อนรับเพดานสูงหรูหรา พร้อมโซนที่นั่งต้อนรับแขก Free Wi-Fi และเคาน์เตอร์สำนักงานนิติบุคคลอาคารชุด แบงค์คอก ฮอไรซอน รามคำแหง 60 พร้อมเจ้าหน้าที่คอยให้บริการทุกวัน",
      "เปิด 24 ชั่วโมง (สำนักงานนิติฯ 08:30 - 17:30 น.)",
      "[]",
      JSON.stringify([
        "สงวนสิทธิ์โซนรับแขกสำหรับลูกบ้านและผู้มาติดต่อโครงการ",
        "แต่งกายสุภาพเมื่อใช้พื้นที่ล็อบบี้ส่วนกลาง",
        "ติดต่อรับพัสดุได้ที่เคาน์เตอร์นิติบุคคลในเวลาทำการ"
      ]),
      "lobby",
      nowStr
    ],
    [
      "fac-5",
      "ระบบรักษาความปลอดภัย & ลิฟต์ล็อคชั้น",
      "24-Hour Security & Access Control",
      "ทุกชั้นอาคาร",
      "ระบบความปลอดภัยมาตรฐานสูง ลิฟต์โดยสารความเร็วสูงระบบล็อคเฉพาะชั้นพักอาศัยและชั้นส่วนกลาง, ประตูทางเข้า-ออกสแกนบัตรคีย์การ์ด Access Control, กล้องวงจรปิด CCTV บันทึกตลอด 24 ชั่วโมง และเจ้าหน้าที่ รปภ. ประจำจุด",
      "บริการตลอด 24 ชั่วโมง",
      "[]",
      JSON.stringify([
        "กรุณาพกพาบัตรคีย์การ์ดประจำตัวเพื่อใช้ขึ้น-ลงอาคาร",
        "กรณีทำบัตรหาย โปรดแจ้งสำนักงานนิติบุคคลทันทีเพื่อระงับสัญญาณบัตรเดิม",
        "ผู้มาติดต่อภายนอกต้องแลกบัตรประชาชนที่ป้อม รปภ. ด้านหน้าโครงการ"
      ]),
      "security",
      nowStr
    ],
    [
      "fac-6",
      "อาคารจอดรถในร่ม Easy Pass",
      "Covered Parking Building",
      "ชั้น 1 - 7",
      "พื้นที่จอดรถในร่ม 7 ชั้น ป้องกันรถยนต์จากแดดและฝน เข้า-ออกอาคารด้วยระบบอ่านสติ๊กเกอร์ RFID / Easy Pass อัตโนมัติ พร้อมไฟส่องสว่าง กล้อง CCTV และทางลาดขึ้น-ลงที่กว้างขวางขับขี่สะดวก",
      "บริการตลอด 24 ชั่วโมง",
      "[]",
      JSON.stringify([
        "ติดสติ๊กเกอร์จอดรถของโครงการบริเวณกระจกหน้ารถให้เห็นชัดเจน",
        "จอดรถในช่องจอด ไม่จอดขวางทางหรือกีดขวางช่องจราจร",
        "จำกัดความเร็วภายในอาคารจอดรถไม่เกิน 20 กม./ชม."
      ]),
      "parking",
      nowStr
    ]
  ];

  for (var i = 0; i < defaults.length; i++) {
    sheet.appendRow(defaults[i]);
  }
}

function seedDefaultServices(sheet) {
  var nowStr = new Date().toISOString();
  var defaults = [
    [
      "service-1",
      "service",
      "บริการนัดหมายเข้าชมห้องจริง",
      "ท่านที่สนใจเช่าหรือซื้อห้องชุด สามารถติดต่อสำนักงานนิติบุคคลล่วงหน้าเพื่อเบิกกุญแจ โดยมีเจ้าหน้าที่พาชมห้องชุดจริงและสิ่งอำนวยความสะดวกในโครงการ",
      "พาชมห้องจริง",
      "key",
      JSON.stringify([
        "แจ้งนัดหมายล่วงหน้าอย่างน้อย 1-2 ชั่วโมง",
        "เจ้าหน้าที่นิติบุคคลอำนวยความสะดวกนำชมห้องจริง",
        "เปิดบริการเข้าชมทุกวัน 08:30 - 17:30 น."
      ]),
      "08:30 - 17:30 น. (ทุกวัน)",
      nowStr
    ],
    [
      "service-2",
      "service",
      "สัญญาเช่ามาตรฐาน & ออกใบจองห้องชุด",
      "จัดทำสัญญาเช่ามาตรฐานตามกฎหมาย ตรวจสอบบันทึกรายการเฟอร์นิเจอร์ และออกเอกสารใบจองห้องชุดอย่างถูกต้องและโปร่งใส",
      "สัญญามาตรฐาน",
      "file",
      JSON.stringify([
        "สัญญาเช่ามาตรฐานตรวจสอบโดยฝ่ายนิติบุคคล",
        "มีบันทึกรายการตรวจรับห้องและทรัพย์สิน (Inventory Checklist)",
        "ออกใบเสร็จรับเงินจองห้องชุดอย่างเป็นทางการ"
      ]),
      "สำนักงานนิติบุคคล ชั้น 1",
      nowStr
    ],
    [
      "service-3",
      "service",
      "จุดรับพัสดุส่วนกลาง (Parcel Counter)",
      "นิติบุคคลรับฝากพัสดุจากพนักงานส่งของอย่างปลอดภัย ลูกบ้านสามารถนำบัตรประชาชนหรือแจ้งเลขห้องเพื่อรับพัสดุได้ทุกวัน",
      "ปลอดภัย 100%",
      "package",
      JSON.stringify([
        "คัดแยกพัสดุตามเลขห้องอย่างเป็นระเบียบ",
        "แสดงบัตรประชาชนหรือคีย์การ์ดเพื่อยืนยันการรับ",
        "มีกล้อง CCTV เฝ้าระวังพื้นที่จุดรับพัสดุตลอด 24 ชม."
      ]),
      "รับพัสดุได้ทุกวัน 08:30 - 20:00 น.",
      nowStr
    ],
    [
      "service-4",
      "service",
      "บริการประสานงานทีมช่างอาคาร (In-house Technician)",
      "มีช่างประจำอาคารคอยตรวจสอบระบบน้ำ ไฟฟ้าฉุกเฉิน และประสานงานซ่อมบำรุงส่วนกลางตลอด 24 ชั่วโมง",
      "ช่างประจำอาคาร",
      "wrench",
      JSON.stringify([
        "ทีมช่างสแตนด์บายดูแลระบบน้ำ-ไฟฟ้าส่วนกลางตลอด 24 ชม.",
        "ช่วยประสานงานแก้ปัญหาฉุกเฉินเบื้องต้นในห้องพัก",
        "แจ้งเรื่องผ่านเคาน์เตอร์นิติบุคคล หรือ LINE Official"
      ]),
      "ฉุกเฉิน 24 ชั่วโมง",
      nowStr
    ],
    [
      "rule-1",
      "rule",
      "เอกสารและเงื่อนไขการทำสัญญาเช่า",
      "ข้อกำหนดและเอกสารจำเป็นสำหรับการทำสัญญาเช่าพักอาศัยในโครงการ Bangkok Horizon Ram 60",
      "เงื่อนไขสัญญา",
      "shield",
      JSON.stringify([
        "สำเนาบัตรประชาชน หรือ Passport (กรณีชาวต่างชาติ)",
        "เงินประกันความเสียหาย 2 เดือน + ค่าเช่าล่วงหน้า 1 เดือน ณ วันทำสัญญา",
        "ระยะเวลาสัญญาเช่ามาตรฐานขั้นต่ำ 1 ปี (หรือตามข้อตกลงกับเจ้าของห้อง)"
      ]),
      "ฝ่ายบริหารสัญญาเช่า",
      nowStr
    ],
    [
      "rule-2",
      "rule",
      "ระเบียบการขนย้ายสิ่งของเข้า-ออก (Move-in / Move-out)",
      "แนวทางปฏิบัติในการขนย้ายเฟอร์นิเจอร์เพื่อความปลอดภัย และไม่รบกวนผู้พักอาศัยท่านอื่น",
      "การขนย้าย",
      "clock",
      JSON.stringify([
        "แจ้งนิติบุคคลล่วงหน้าอย่างน้อย 1-2 วันเพื่อจองลิฟต์ขนของ",
        "ช่วงเวลาขนย้าย: วันจันทร์ - เสาร์ เวลา 09:00 - 17:00 น. (งดวันอาทิตย์และวันหยุดนักขัตฤกษ์)",
        "วางเงินประกันความเสียหายการขนย้ายตามระเบียบ และรับคืนทันทีหลังตรวจพื้นที่"
      ]),
      "จองคิวล่วงหน้า 1-2 วัน",
      nowStr
    ],
    [
      "rule-3",
      "rule",
      "การใช้บัตรคีย์การ์ด สิทธิ์ที่จอดรถ และความปลอดภัย",
      "สิทธิ์ในการเข้า-ออกอาคาร การลงทะเบียนยานพาหนะ และการรักษาความปลอดภัยร่วมกัน",
      "ความปลอดภัย",
      "home",
      JSON.stringify([
        "สิทธิ์จอดรถยนต์ 1 คัน ต่อ 1 ห้องชุด (ต้องลงทะเบียนสติกเกอร์ที่นิติบุคคล)",
        "บัตรคีย์การ์ดล็อคชั้นเฉพาะชั้นพักอาศัยของตนเองและชั้นสิ่งอำนวยความสะดวก",
        "ไม่อนุญาตให้นำสัตว์เลี้ยงเข้ามาพักอาศัยภายในอาคาร (No Pets Allowed)"
      ]),
      "เคาน์เตอร์นิติบุคคล ชั้น 1",
      nowStr
    ]
  ];

  for (var i = 0; i < defaults.length; i++) {
    sheet.appendRow(defaults[i]);
  }
}

function getDatabaseSpreadsheet() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var spreadsheetId = props.SPREADSHEET_ID;
  if (!spreadsheetId) {
    var setupRes = setupProject();
    spreadsheetId = setupRes.spreadsheetId;
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

// --------------------------------------------------------------------------
// 3. ROOMS CRUD (DYNAMIC HEADER MAPPING & AUTO-MIGRATION)
// --------------------------------------------------------------------------

function getRoomsData() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Rooms");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Rooms");
  }
  if (!sheet) return [];

  // ตรวจสอบและอัปเดตหัวคอลัมน์อัตโนมัติ (หากมีฟิลด์ใหม่เพิ่มเข้ามาในระบบ)
  var hmInfo = ensureRoomSheetHeaders(sheet);
  if (sheet.getLastRow() <= 1) return [];

  var headerMap = hmInfo.map;
  var idCol = headerMap["id"] !== undefined ? headerMap["id"] : 0;

  var data = sheet.getDataRange().getValues();
  var rooms = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[idCol]) continue;

    var roomObj = {};

    // อ่านข้อมูลทุกฟิลด์ตาม Header Mapping
    for (var s = 0; s < ROOM_FIELD_SPECS.length; s++) {
      var spec = ROOM_FIELD_SPECS[s];
      var colIdx = headerMap[spec.key];
      var rawVal = (colIdx !== undefined && colIdx < row.length) ? row[colIdx] : undefined;

      switch (spec.type) {
        case "json_array":
          var arrVal = safeJsonParse(rawVal, []);
          if (spec.key === "images") {
            roomObj[spec.key] = Array.isArray(arrVal) ? arrVal.map(function(item) {
              if (typeof item !== "string") return "";
              var str = item.trim();
              var match = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                          str.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                          str.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (match && match[1] && (str.indexOf("drive.google.com") > -1 || str.indexOf("googleusercontent.com") > -1 || str.indexOf("google.com") > -1)) {
                return "https://lh3.googleusercontent.com/d/" + match[1];
              }
              return str;
            }).filter(function(x) { return x && x.length > 0; }) : [];
          } else {
            roomObj[spec.key] = arrVal;
          }
          break;

        case "boolean":
          roomObj[spec.key] = parseBoolean(rawVal, spec.defaultVal || false);
          break;

        case "number":
          roomObj[spec.key] = parseNumber(rawVal, spec.defaultVal || 0);
          break;

        case "date":
          roomObj[spec.key] = formatIsoOrDate(rawVal) || "";
          break;

        case "status":
          roomObj[spec.key] = String(rawVal || spec.defaultVal || "available").trim().toLowerCase();
          break;

        default: // string
          roomObj[spec.key] = (rawVal !== undefined && rawVal !== null) ? String(rawVal) : (spec.defaultVal || "");
          break;
      }
    }

    // กฎเกณฑ์สถานะห้อง (Status / Publish / Trash Rules)
    var isTrashVal = roomObj.isTrash === true;
    var statusVal = (roomObj.status || "available").trim().toLowerCase();
    var isPublishedVal = false;

    if (isTrashVal) {
      isPublishedVal = false;
      statusVal = "available";
    } else if (statusVal === "rented" || statusVal === "pending") {
      isPublishedVal = false;
      isTrashVal = false;
    } else {
      statusVal = "available";
      isTrashVal = false;
      var hasPubCol = headerMap["isPublished"] !== undefined;
      var rawPub = hasPubCol ? row[headerMap["isPublished"]] : undefined;
      if (rawPub !== undefined && rawPub !== null && rawPub !== "") {
        isPublishedVal = roomObj.isPublished === true;
      } else {
        isPublishedVal = true; // fallback สำหรับข้อมูลเดิม
      }
    }

    roomObj.status = statusVal;
    roomObj.isPublished = isPublishedVal;
    roomObj.isTrash = isTrashVal;
    if (!roomObj.createdAt) {
      roomObj.createdAt = new Date().toISOString();
    }
    if (!roomObj.updatedAt) {
      roomObj.updatedAt = roomObj.createdAt;
    }

    rooms.push(roomObj);
  }

  return rooms;
}

function saveRoomData(room) {
  if (typeof room === "string") {
    try { room = JSON.parse(room); } catch (e) {}
  }
  if (!room || !room.id) return { success: false, error: "Missing room data or ID" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Rooms");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Rooms");
  }

  // ตรวจสอบและเพิ่มคอลัมน์ที่ขาดไปใน Google Sheet อัตโนมัติ
  var hmInfo = ensureRoomSheetHeaders(sheet);
  var headers = hmInfo.headers;
  var headerMap = hmInfo.map;

  // กฎเกณฑ์สถานะห้อง
  var isTrashVal = room.isTrash === true || String(room.isTrash).toLowerCase() === "true";
  var statusVal = String(room.status || "available").trim().toLowerCase();
  var isPublishedVal = false;

  if (isTrashVal) {
    statusVal = "available";
    isPublishedVal = false;
    if (!room.trashedAt) {
      room.trashedAt = new Date().toISOString();
    }
  } else if (statusVal === "rented" || statusVal === "pending") {
    isPublishedVal = false;
    isTrashVal = false;
    room.trashedAt = "";
  } else {
    statusVal = "available";
    isTrashVal = false;
    room.trashedAt = "";
    isPublishedVal = room.isPublished === true || String(room.isPublished).toLowerCase() === "true";
  }

  room.status = statusVal;
  room.isPublished = isPublishedVal;
  room.isTrash = isTrashVal;
  room.updatedAt = new Date().toISOString();
  if (!room.createdAt) {
    room.createdAt = room.updatedAt;
  }

  // ตรวจสอบและทำให้แน่ใจว่า room.images เป็น Google Drive Direct URL จริง (ไม่ใช่ Base64 และไม่มีปัญหาขนาดเซลล์ Sheet)
  if (room.images) {
    var rawImgs = Array.isArray(room.images) ? room.images : safeJsonParse(room.images, []);
    var cleanImgs = [];
    var cleanRoomNumber = String(room.roomNumber || "temp").trim().replace(/[\/\\:*?"<>|]/g, "-");

    for (var k = 0; k < rawImgs.length; k++) {
      var item = rawImgs[k];
      if (typeof item !== "string") continue;
      item = item.trim();
      if (!item) continue;

      // หากพบว่ายังเป็น Base64 ที่หลุดเข้ามา ให้อัปโหลดขึ้น Google Drive เป็นไฟล์ถาวรทันที
      if (item.indexOf("data:image") === 0 || (item.indexOf("base64,") > -1 && item.length > 300)) {
        try {
          var uploadRes = uploadFileToDrive(item, "photo_" + cleanRoomNumber + "_" + Date.now() + "_" + (k + 1) + ".jpg", "image/jpeg", cleanRoomNumber, "photos");
          if (uploadRes && uploadRes.success && uploadRes.url) {
            cleanImgs.push(uploadRes.directUrl || uploadRes.url);
          }
        } catch (upErr) {
          // ละเว้นเพื่อไม่ให้ Base64 ขนาดใหญ่เกิน 50,000 ตัวอักษรไปทำให้ Google Sheet บันทึกพัง
        }
      } else {
        // หากเป็น Google Drive URL ในรูปแบบต่างๆ ให้แปลงเป็น Direct CDN URL (lh3.googleusercontent.com/d/ID)
        var match = item.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                    item.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                    item.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1] && (item.indexOf("drive.google.com") > -1 || item.indexOf("googleusercontent.com") > -1 || item.indexOf("google.com") > -1)) {
          cleanImgs.push("https://lh3.googleusercontent.com/d/" + match[1]);
        } else {
          cleanImgs.push(item);
        }
      }
    }
    room.images = cleanImgs;
  }

  var idCol = headerMap["id"] !== undefined ? headerMap["id"] : 0;
  var roomNumCol = headerMap["roomNumber"] !== undefined ? headerMap["roomNumber"] : 1;

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var existingRowValues = null;

  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][idCol] || "");
    var rowNum = String(data[i][roomNumCol] || "").trim();
    if (rowId === String(room.id) || (room.roomNumber && rowNum === String(room.roomNumber).trim())) {
      rowIndex = i + 1;
      existingRowValues = data[i];
      break;
    }
  }

  // รักษาค่าเดิมของคอลัมน์ที่ไม่รู้จัก (Custom Columns) เพื่อป้องกันข้อมูลสูญหาย
  var rowData = existingRowValues ? existingRowValues.slice() : new Array(headers.length).fill("");
  while (rowData.length < headers.length) {
    rowData.push("");
  }

  // เติมข้อมูลลงแต่ละคอลัมน์ตาม Header Mapping
  for (var s = 0; s < ROOM_FIELD_SPECS.length; s++) {
    var spec = ROOM_FIELD_SPECS[s];
    var colIdx = headerMap[spec.key];
    if (colIdx === undefined || colIdx < 0) continue;

    var val = room[spec.key];
    var cellVal = "";

    switch (spec.type) {
      case "json_array":
        if (Array.isArray(val)) {
          cellVal = JSON.stringify(val);
        } else if (typeof val === "string" && val.trim().length > 0) {
          cellVal = JSON.stringify(safeJsonParse(val, []));
        } else {
          cellVal = "[]";
        }
        break;

      case "boolean":
        cellVal = val ? "true" : "false";
        break;

      case "number":
        cellVal = (val !== undefined && val !== null && val !== "") ? (Number(val) || 0) : (spec.defaultVal || 0);
        break;

      case "date":
        cellVal = val ? formatIsoOrDate(val) : "";
        break;

      case "status":
        cellVal = statusVal;
        break;

      default: // string
        cellVal = (val !== undefined && val !== null) ? String(val) : (spec.defaultVal || "");
        break;
    }

    rowData[colIdx] = cellVal;
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return { success: true, room: room };
}

function deleteRoomData(id) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Rooms");
  if (!sheet) return { success: false, error: "Sheet not found" };

  var hmInfo = ensureRoomSheetHeaders(sheet);
  var idCol = (hmInfo && hmInfo.map && hmInfo.map["id"] !== undefined) ? hmInfo.map["id"] : 0;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: "Room not found" };
}

// --------------------------------------------------------------------------
// 4. LEASES CRUD (สัญญาเช่า & ผู้เช่า)
// --------------------------------------------------------------------------

function getLeasesData() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Leases");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Leases");
  }
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data = sheet.getDataRange().getValues();
  var leases = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    leases.push({
      id: String(row[0]),
      roomId: String(row[1] || ""),
      roomNumber: String(row[2] || ""),
      condoName: String(row[3] || ""),
      tenantName: String(row[4] || ""),
      tenantPhone: String(row[5] || ""),
      tenantEmail: String(row[6] || ""),
      tenantIdCard: String(row[7] || ""),
      startDate: formatDate(row[8]),
      endDate: formatDate(row[9]),
      monthlyRent: Number(row[10]) || 0,
      depositAmount: Number(row[11]) || 0,
      advanceRent: Number(row[12]) || 0,
      status: String(row[13] || "active"),
      contractUrl: String(row[14] || ""),
      notes: String(row[15] || ""),
      updatedAt: String(row[16] || "")
    });
  }
  return leases;
}

function saveLeaseData(lease) {
  if (!lease || !lease.id) return { success: false, error: "Missing lease data" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Leases");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Leases");
  }

  var rowData = [
    lease.id,
    lease.roomId || "",
    lease.roomNumber || "",
    lease.condoName || "",
    lease.tenantName || "",
    lease.tenantPhone || "",
    lease.tenantEmail || "",
    lease.tenantIdCard || "",
    lease.startDate || "",
    lease.endDate || "",
    lease.monthlyRent || 0,
    lease.depositAmount || 0,
    lease.advanceRent || 0,
    lease.status || "active",
    lease.contractUrl || "",
    lease.notes || "",
    new Date().toISOString()
  ];

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(lease.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  if (lease.roomId) {
    try {
      updateRoomStatusForLease(lease.roomId, lease.status === "active" ? "rented" : "available");
    } catch(e) {}
  }

  return { success: true, lease: lease };
}

function deleteLeaseData(id) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Leases");
  if (!sheet) return { success: false, error: "Sheet not found" };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: "Lease not found" };
}

function updateRoomStatusForLease(roomId, newStatus) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Rooms");
  if (!sheet) return;
  var hmInfo = ensureRoomSheetHeaders(sheet);
  var idCol = (hmInfo && hmInfo.map && hmInfo.map["id"] !== undefined) ? hmInfo.map["id"] : 0;
  var roomNumCol = (hmInfo && hmInfo.map && hmInfo.map["roomNumber"] !== undefined) ? hmInfo.map["roomNumber"] : -1;
  var statusCol = (hmInfo && hmInfo.map && hmInfo.map["status"] !== undefined) ? hmInfo.map["status"] : -1;
  var pubCol = (hmInfo && hmInfo.map && hmInfo.map["isPublished"] !== undefined) ? hmInfo.map["isPublished"] : -1;
  var updatedCol = (hmInfo && hmInfo.map && hmInfo.map["updatedAt"] !== undefined) ? hmInfo.map["updatedAt"] : -1;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var curId = String(data[i][idCol]).trim();
    var curNum = (roomNumCol >= 0 && roomNumCol < data[i].length) ? String(data[i][roomNumCol]).trim() : "";
    var target = String(roomId).trim();
    if (curId === target || (curNum && curNum === target)) {
      if (statusCol >= 0) {
        sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      }
      if (pubCol >= 0) {
        var isPub = (newStatus === "available");
        sheet.getRange(i + 1, pubCol + 1).setValue(isPub ? "true" : "false");
      }
      if (updatedCol >= 0) {
        sheet.getRange(i + 1, updatedCol + 1).setValue(new Date().toISOString());
      }
      break;
    }
  }
}

// --------------------------------------------------------------------------
// 5. BOOKINGS CRUD (DYNAMIC HEADER MAPPING & PERSISTENCE)
// --------------------------------------------------------------------------

var BOOKING_FIELD_SPECS = [
  { key: "id", header: "ID", type: "string", aliases: ["id", "bookingid", "booking_id", "รหัสใบจอง"] },
  { key: "receiptNumber", header: "ReceiptNumber", type: "string", aliases: ["receiptnumber", "receipt_number", "receiptno", "receipt#", "เลขที่ใบจอง", "เลขที่ใบเสร็จ", "เลขที่เอกสาร"] },
  { key: "bookingDate", header: "BookingDate", type: "date", aliases: ["bookingdate", "booking_date", "date", "วันที่จอง", "วันที่ออกเอกสาร", "วันที่"] },
  { key: "roomId", header: "RoomID", type: "string", aliases: ["roomid", "room_id", "รหัสห้อง"] },
  { key: "roomNumber", header: "RoomNumber", type: "string", aliases: ["roomnumber", "room_number", "roomno", "room#", "เลขห้อง", "ห้อง"] },
  { key: "condoName", header: "CondoName", type: "string", defaultVal: "Bangkok Horizon Ram 60", aliases: ["condoname", "condo_name", "condo", "ชื่อโครงการ", "ชื่อคอนโด"] },
  { key: "bookingType", header: "BookingType", type: "string", defaultVal: "rent", aliases: ["bookingtype", "booking_type", "type", "ประเภทการจอง", "ประเภทสัญญา"] },
  { key: "customerName", header: "CustomerName", type: "string", aliases: ["customername", "customer_name", "customer", "tenant", "ชื่อผู้จอง", "ชื่อลูกค้า", "ผู้จอง"] },
  { key: "customerPhone", header: "CustomerPhone", type: "string", aliases: ["customerphone", "customer_phone", "phone", "เบอร์โทร", "เบอร์โทรศัพท์", "เบอร์ติดต่อ"] },
  { key: "customerEmail", header: "CustomerEmail", type: "string", defaultVal: "", aliases: ["customeremail", "customer_email", "email", "อีเมล"] },
  { key: "customerIdCard", header: "CustomerIdCard", type: "string", defaultVal: "", aliases: ["customeridcard", "customer_id_card", "idcard", "เลขบัตรประชาชน", "passport", "บัตรประชาชน"] },
  { key: "price", header: "Price", type: "number", defaultVal: 0, aliases: ["price", "rentprice", "saleprice", "ราคา", "ราคาเช่า", "ราคาขาย", "ราคาตกลง"] },
  { key: "bookingAmount", header: "BookingAmount", type: "number", defaultVal: 0, aliases: ["bookingamount", "booking_amount", "deposit", "fee", "bookingfee", "เงินมัดจำ", "เงินจอง", "ยอดเงินจอง", "เงินมัดจำการจอง"] },
  { key: "paymentMethod", header: "PaymentMethod", type: "string", defaultVal: "transfer", aliases: ["paymentmethod", "payment_method", "payment", "วิธีชำระเงิน", "การชำระเงิน", "ช่องทางชำระเงิน"] },
  { key: "contractSignDate", header: "ContractSignDate", type: "date", aliases: ["contractsigndate", "contract_sign_date", "signdate", "วันทำสัญญา", "วันนัดทำสัญญา", "กำหนดวันทำสัญญา"] },
  { key: "remainingDeposit", header: "RemainingDeposit", type: "number", defaultVal: 0, aliases: ["remainingdeposit", "remaining_deposit", "balance", "เงินประกันคงเหลือ", "เงินคงเหลือ"] },
  { key: "recipientType", header: "RecipientType", type: "string", defaultVal: "juristic", aliases: ["recipienttype", "recipient_type", "ประเภทผู้รับเงิน", "ผู้รับเงินประเภท"] },
  { key: "recipientName", header: "RecipientName", type: "string", aliases: ["recipientname", "recipient_name", "payee", "payeename", "ชื่อผู้รับเงิน", "ผู้รับเงิน"] },
  { key: "agentName", header: "AgentName", type: "string", aliases: ["agentname", "agent_name", "agent", "เจ้าหน้าที่", "ผู้ดูแล"] },
  { key: "terms", header: "Terms", type: "string", defaultVal: "", aliases: ["terms", "termsandconditions", "condition", "เงื่อนไข", "ข้อตกลง", "เงื่อนไขการจอง", "ข้อตกลงและเงื่อนไข"] },
  { key: "createdAt", header: "CreatedAt", type: "date", aliases: ["createdat", "created_at", "สร้างเมื่อ", "timestamp", "วันที่บันทึก"] }
];

function buildBookingHeaderMap(headers) {
  var map = {};
  var headerNormalized = [];
  for (var c = 0; c < headers.length; c++) {
    headerNormalized.push(normalizeHeaderName(headers[c]));
  }

  var missingSpecs = [];
  for (var s = 0; s < BOOKING_FIELD_SPECS.length; s++) {
    var spec = BOOKING_FIELD_SPECS[s];
    var matchedIndex = -1;

    var canonNorm = normalizeHeaderName(spec.header);
    for (var c = 0; c < headerNormalized.length; c++) {
      if (headerNormalized[c] === canonNorm) {
        matchedIndex = c;
        break;
      }
    }

    if (matchedIndex === -1 && spec.aliases) {
      for (var a = 0; a < spec.aliases.length; a++) {
        var aliasNorm = normalizeHeaderName(spec.aliases[a]);
        for (var c = 0; c < headerNormalized.length; c++) {
          if (headerNormalized[c] === aliasNorm) {
            matchedIndex = c;
            break;
          }
        }
        if (matchedIndex !== -1) break;
      }
    }

    if (matchedIndex !== -1) {
      map[spec.key] = matchedIndex;
    } else {
      missingSpecs.push(spec);
    }
  }

  return {
    map: map,
    missingSpecs: missingSpecs
  };
}

function ensureBookingSheet(ss) {
  var sheet = ss.getSheetByName("Bookings");
  if (!sheet) {
    sheet = ss.insertSheet("Bookings");
  }
  ensureBookingSheetHeaders(sheet);
  return sheet;
}

function ensureBookingSheetHeaders(sheet) {
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    var allHeaders = BOOKING_FIELD_SPECS.map(function(s) { return s.header; });
    sheet.appendRow(allHeaders);
    var range = sheet.getRange(1, 1, 1, allHeaders.length);
    range.setBackground("#1e293b");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    sheet.setFrozenRows(1);
    return {
      headers: allHeaders,
      map: buildBookingHeaderMap(allHeaders).map
    };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var hmInfo = buildBookingHeaderMap(headers);

  // If any missing specs, automatically append missing headers to row 1
  if (hmInfo.missingSpecs && hmInfo.missingSpecs.length > 0) {
    var newHeaders = hmInfo.missingSpecs.map(function(s) { return s.header; });
    var startCol = lastCol + 1;
    sheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
    var newRange = sheet.getRange(1, startCol, 1, newHeaders.length);
    newRange.setBackground("#1e293b");
    newRange.setFontColor("#ffffff");
    newRange.setFontWeight("bold");

    var updatedLastCol = lastCol + newHeaders.length;
    headers = sheet.getRange(1, 1, 1, updatedLastCol).getValues()[0];
    hmInfo = buildBookingHeaderMap(headers);
  }

  return {
    headers: headers,
    map: hmInfo.map
  };
}

function getBookingsData() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Bookings");
  }
  if (!sheet) return [];

  var hmInfo = ensureBookingSheetHeaders(sheet);
  if (!hmInfo || sheet.getLastRow() <= 1) return [];

  var headerMap = hmInfo.map;
  var idCol = headerMap["id"] !== undefined ? headerMap["id"] : 0;

  var data = sheet.getDataRange().getValues();
  var bookings = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[idCol]) continue;

    var bookingObj = {};

    for (var s = 0; s < BOOKING_FIELD_SPECS.length; s++) {
      var spec = BOOKING_FIELD_SPECS[s];
      var colIdx = headerMap[spec.key];
      var rawVal = (colIdx !== undefined && colIdx < row.length) ? row[colIdx] : undefined;

      switch (spec.type) {
        case "number":
          bookingObj[spec.key] = parseNumber(rawVal, spec.defaultVal || 0);
          break;

        case "date":
          bookingObj[spec.key] = formatIsoOrDate(rawVal) ? formatIsoOrDate(rawVal).split('T')[0] : (spec.defaultVal || "");
          break;

        default: // string
          bookingObj[spec.key] = (rawVal !== undefined && rawVal !== null) ? String(rawVal).trim() : (spec.defaultVal || "");
          break;
      }
    }

    var agentName = bookingObj.agentName || "";
    var recipientName = bookingObj.recipientName || agentName;
    var recipientType = bookingObj.recipientType || (agentName.indexOf("เจ้าของ") >= 0 ? "owner" : "juristic");

    bookingObj.recipientType = recipientType;
    bookingObj.recipientName = recipientName;
    bookingObj.agentName = recipientName || agentName;

    if (!bookingObj.createdAt) {
      bookingObj.createdAt = new Date().toISOString();
    }
    if (!bookingObj.bookingDate) {
      bookingObj.bookingDate = new Date().toISOString().split('T')[0];
    }

    bookings.push(bookingObj);
  }

  return bookings;
}

function saveBookingData(booking) {
  if (typeof booking === "string") {
    try { booking = JSON.parse(booking); } catch (e) {}
  }
  if (!booking || !booking.id) return { success: false, error: "Missing booking data or ID" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Bookings");
  }

  var hmInfo = ensureBookingSheetHeaders(sheet);
  var headers = hmInfo.headers;
  var headerMap = hmInfo.map;

  var recipientType = String(booking.recipientType || "juristic").trim();
  var recipientName = String(booking.recipientName || booking.agentName || "").trim();
  var agentName = recipientName || String(booking.agentName || "").trim();

  var normBooking = {
    id: String(booking.id).trim(),
    receiptNumber: String(booking.receiptNumber || "").trim(),
    bookingDate: formatIsoOrDate(booking.bookingDate) ? formatIsoOrDate(booking.bookingDate).split('T')[0] : String(booking.bookingDate || new Date().toISOString().split('T')[0]),
    roomId: String(booking.roomId || "").trim(),
    roomNumber: String(booking.roomNumber || "").trim(),
    condoName: String(booking.condoName || "Bangkok Horizon Ram 60").trim(),
    bookingType: String(booking.bookingType || "rent").trim(),
    customerName: String(booking.customerName || "").trim(),
    customerPhone: String(booking.customerPhone || "").trim(),
    customerEmail: String(booking.customerEmail || "").trim(),
    customerIdCard: String(booking.customerIdCard || "").trim(),
    price: parseNumber(booking.price, 0),
    bookingAmount: parseNumber(booking.bookingAmount, 0),
    paymentMethod: String(booking.paymentMethod || "transfer").trim(),
    contractSignDate: formatIsoOrDate(booking.contractSignDate) ? formatIsoOrDate(booking.contractSignDate).split('T')[0] : String(booking.contractSignDate || ""),
    remainingDeposit: parseNumber(booking.remainingDeposit, 0),
    recipientType: recipientType,
    recipientName: recipientName,
    agentName: agentName,
    terms: String(booking.terms || "").trim(),
    createdAt: formatIsoOrDate(booking.createdAt) || new Date().toISOString()
  };

  // Build row data according to header positions
  var rowData = new Array(headers.length);
  for (var k = 0; k < headers.length; k++) {
    rowData[k] = "";
  }

  for (var s = 0; s < BOOKING_FIELD_SPECS.length; s++) {
    var spec = BOOKING_FIELD_SPECS[s];
    var colIdx = headerMap[spec.key];
    if (colIdx !== undefined && colIdx < rowData.length) {
      rowData[colIdx] = normBooking[spec.key] !== undefined ? normBooking[spec.key] : "";
    }
  }

  // Find existing row by ID or receiptNumber
  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  var idCol = headerMap["id"] !== undefined ? headerMap["id"] : 0;
  var rcCol = headerMap["receiptNumber"] !== undefined ? headerMap["receiptNumber"] : -1;

  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][idCol]).trim();
    var rowRc = (rcCol >= 0 && rcCol < data[i].length) ? String(data[i][rcCol]).trim() : "";
    if (rowId === normBooking.id || (normBooking.receiptNumber && rowRc === normBooking.receiptNumber)) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  // Format cells as Text to preserve exact values and prevent date formatting corruption
  try {
    var targetRow = foundRow > 0 ? foundRow : sheet.getLastRow();
    // Keep receiptNumber, customerPhone, customerIdCard as text
    if (rcCol >= 0) sheet.getRange(targetRow, rcCol + 1).setNumberFormat("@");
    if (headerMap["customerPhone"] !== undefined) sheet.getRange(targetRow, headerMap["customerPhone"] + 1).setNumberFormat("@");
    if (headerMap["customerIdCard"] !== undefined) sheet.getRange(targetRow, headerMap["customerIdCard"] + 1).setNumberFormat("@");
  } catch(e) {}

  // Update room status to pending in Google Sheet
  if (normBooking.roomId || normBooking.roomNumber) {
    try {
      updateRoomStatusForLease(normBooking.roomId || normBooking.roomNumber, "pending");
    } catch(e) {}
  }

  return { 
    success: true, 
    booking: normBooking, 
    message: "บันทึกใบจองลง Google Sheet เรียบร้อยแล้ว" 
  };
}

function deleteBookingData(id) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  if (!sheet) return { success: false, error: "Sheet not found" };

  var hmInfo = ensureBookingSheetHeaders(sheet);
  var headerMap = hmInfo ? hmInfo.map : {};
  var idCol = headerMap["id"] !== undefined ? headerMap["id"] : 0;
  var rcCol = headerMap["receiptNumber"] !== undefined ? headerMap["receiptNumber"] : 1;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rId = String(data[i][idCol]).trim();
    var rRc = (rcCol < data[i].length) ? String(data[i][rcCol]).trim() : "";
    if (rId === String(id).trim() || (rRc && rRc === String(id).trim())) {
      sheet.deleteRow(i + 1);
      return { success: true, deletedId: id, message: "ลบใบจองเรียบร้อยแล้ว" };
    }
  }
  return { success: false, error: "Booking not found" };
}

// --------------------------------------------------------------------------
// 6. FACILITIES CRUD (สิ่งอำนวยความสะดวกส่วนกลาง)
// --------------------------------------------------------------------------

function ensureFacilitiesSheet(ss) {
  var facilityHeaders = [
    "ID", "Name", "NameEn", "Floor", "Description", "Hours",
    "Images", "Rules", "IconType", "UpdatedAt"
  ];
  var sheet = ss.getSheetByName("Facilities");
  if (!sheet) {
    sheet = ss.insertSheet("Facilities");
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(facilityHeaders);
    var range = sheet.getRange(1, 1, 1, facilityHeaders.length);
    range.setBackground("#1e293b");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    sheet.setFrozenRows(1);
    seedDefaultFacilities(sheet);
  } else {
    // Check if headers match or if missing columns
    var lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
      var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || "").trim().toLowerCase(); });
      var missing = [];
      for (var k = 0; k < facilityHeaders.length; k++) {
        var fh = facilityHeaders[k];
        if (currentHeaders.indexOf(fh.toLowerCase()) === -1) {
          missing.push(fh);
        }
      }
      if (missing.length > 0) {
        var startCol = lastCol + 1;
        sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
        var newRange = sheet.getRange(1, startCol, 1, missing.length);
        newRange.setBackground("#1e293b");
        newRange.setFontColor("#ffffff");
        newRange.setFontWeight("bold");
      }
    }
  }
  return sheet;
}

function processFacilityImages(images, facilityName) {
  if (!Array.isArray(images) || images.length === 0) return [];
  var processed = [];
  var targetFolder = null;

  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    if (!img || typeof img !== "string") continue;
    var trimmed = img.trim();

    // Check if image is Base64 data
    if (trimmed.indexOf("data:image") === 0 || (trimmed.indexOf("base64,") > -1 && trimmed.length > 500)) {
      try {
        if (!targetFolder) {
          var props = PropertiesService.getScriptProperties().getProperties();
          var rootFolderId = props.FOLDER_ID;
          if (!rootFolderId) {
            setupProject();
            rootFolderId = PropertiesService.getScriptProperties().getProperty("FOLDER_ID");
          }
          var rootFolder = DriveApp.getFolderById(rootFolderId);
          var facFolders = rootFolder.getFoldersByName("ส่วนกลาง_Facilities");
          if (facFolders.hasNext()) {
            targetFolder = facFolders.next();
          } else {
            targetFolder = rootFolder.createFolder("ส่วนกลาง_Facilities");
            targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          }
        }

        var cleanBase64 = trimmed;
        var mimeType = "image/jpeg";
        var mimeMatch = trimmed.match(/^data:([^;]+);base64,/);
        if (mimeMatch && mimeMatch[1]) {
          mimeType = mimeMatch[1];
        }
        if (cleanBase64.indexOf("base64,") > -1) {
          cleanBase64 = cleanBase64.split("base64,")[1];
        }

        var decoded = Utilities.base64Decode(cleanBase64);
        var safeFacName = String(facilityName || "fac").replace(/[\/\\:*?"<>|]/g, "_").substring(0, 30);
        var blob = Utilities.newBlob(decoded, mimeType, "fac_" + safeFacName + "_" + Date.now() + "_" + i + ".jpg");
        var file = targetFolder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        var fileId = file.getId();
        processed.push("https://lh3.googleusercontent.com/d/" + fileId);
      } catch (err) {
        if (trimmed.length < 500) {
          processed.push(trimmed);
        }
      }
    } else {
      processed.push(trimmed);
    }
  }

  return processed;
}

function getFacilitiesData() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ensureFacilitiesSheet(ss);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data = sheet.getDataRange().getValues();
  var facilities = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    facilities.push({
      id: String(row[0]),
      name: String(row[1] || ""),
      nameEn: String(row[2] || ""),
      floor: String(row[3] || ""),
      description: String(row[4] || ""),
      hours: String(row[5] || ""),
      images: safeJsonParse(row[6], []),
      rules: safeJsonParse(row[7], []),
      iconType: String(row[8] || "pool"),
      updatedAt: String(row[9] || "")
    });
  }
  return facilities;
}

function saveFacilityData(fac) {
  if (!fac || !fac.id) return { success: false, error: "Missing facility data or ID" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ensureFacilitiesSheet(ss);

  // Process images: upload any base64 images to Google Drive automatically to prevent cell limit errors
  var finalImages = processFacilityImages(fac.images || [], fac.name || "facility");

  var rowData = [
    String(fac.id),
    String(fac.name || ""),
    String(fac.nameEn || ""),
    String(fac.floor || ""),
    String(fac.description || ""),
    String(fac.hours || ""),
    JSON.stringify(finalImages),
    JSON.stringify(Array.isArray(fac.rules) ? fac.rules : safeJsonParse(fac.rules, [])),
    String(fac.iconType || "pool"),
    new Date().toISOString()
  ];

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(fac.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  var savedFac = {
    id: String(fac.id),
    name: String(fac.name || ""),
    nameEn: String(fac.nameEn || ""),
    floor: String(fac.floor || ""),
    description: String(fac.description || ""),
    hours: String(fac.hours || ""),
    images: finalImages,
    rules: Array.isArray(fac.rules) ? fac.rules : safeJsonParse(fac.rules, []),
    iconType: String(fac.iconType || "pool"),
    updatedAt: rowData[9]
  };

  return { success: true, facility: savedFac, message: "บันทึกข้อมูลส่วนกลางลง Google Sheet สำเร็จ" };
}

function deleteFacilityData(id) {
  if (!id) return { success: false, error: "Missing ID" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ensureFacilitiesSheet(ss);
  if (!sheet) return { success: false, error: "Facilities sheet not found" };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true, deletedId: id, message: "ลบข้อมูลส่วนกลางออกจาก Google Sheet เรียบร้อยแล้ว" };
    }
  }
  return { success: false, error: "Facility not found" };
}

function saveFacilitiesBulk(facilities) {
  if (!Array.isArray(facilities)) return { success: false, error: "Invalid facilities array" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ensureFacilitiesSheet(ss);

  // Clear rows after header
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  var nowStr = new Date().toISOString();
  for (var i = 0; i < facilities.length; i++) {
    var fac = facilities[i];
    if (!fac || !fac.id) continue;
    var finalImages = processFacilityImages(fac.images || [], fac.name || "facility");
    sheet.appendRow([
      String(fac.id),
      String(fac.name || ""),
      String(fac.nameEn || ""),
      String(fac.floor || ""),
      String(fac.description || ""),
      String(fac.hours || ""),
      JSON.stringify(finalImages),
      JSON.stringify(Array.isArray(fac.rules) ? fac.rules : safeJsonParse(fac.rules, [])),
      String(fac.iconType || "pool"),
      nowStr
    ]);
  }

  return { success: true, count: facilities.length, message: "บันทึกข้อมูลส่วนกลางทั้งหมดเรียบร้อยแล้ว" };
}

// --------------------------------------------------------------------------
// 7. JURISTIC SERVICES & RULES CRUD (บริการนิติบุคคล & ระเบียบการเช่า)
// --------------------------------------------------------------------------

function getJuristicServicesData() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("JuristicServices");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("JuristicServices");
  }
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data = sheet.getDataRange().getValues();
  var services = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    services.push({
      id: String(row[0]),
      category: String(row[1] || "service"),
      title: String(row[2] || ""),
      description: String(row[3] || ""),
      badge: String(row[4] || ""),
      icon: String(row[5] || ""),
      details: safeJsonParse(row[6], []),
      hoursOrContact: String(row[7] || ""),
      updatedAt: String(row[8] || "")
    });
  }
  return services;
}

function saveJuristicServiceData(item) {
  if (!item || !item.id) return { success: false, error: "Missing juristic service data or ID" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("JuristicServices");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("JuristicServices");
  }

  var rowData = [
    item.id,
    item.category || "service",
    item.title || "",
    item.description || "",
    item.badge || "",
    item.icon || "",
    JSON.stringify(item.details || []),
    item.hoursOrContact || "",
    new Date().toISOString()
  ];

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(item.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return { success: true, service: item };
}

function deleteJuristicServiceData(id) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("JuristicServices");
  if (!sheet) return { success: false, error: "Sheet not found" };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: "Service not found" };
}

function saveJuristicServicesBulk(services) {
  if (!Array.isArray(services)) return { success: false, error: "Invalid services array" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("JuristicServices");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("JuristicServices");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  var nowStr = new Date().toISOString();
  for (var i = 0; i < services.length; i++) {
    var item = services[i];
    if (!item || !item.id) continue;
    sheet.appendRow([
      item.id,
      item.category || "service",
      item.title || "",
      item.description || "",
      item.badge || "",
      item.icon || "",
      JSON.stringify(item.details || []),
      item.hoursOrContact || "",
      nowStr
    ]);
  }

  return { success: true, count: services.length, message: "บันทึกข้อมูลบริการนิติ/ระเบียบทั้งหมดเรียบร้อยแล้ว" };
}

// --------------------------------------------------------------------------
// 8. APP SETTINGS (ADMIN PASSWORD, EMAIL, SYSTEM CONFIG)
// --------------------------------------------------------------------------

function getSettingsData() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Settings");
  }

  var data = sheet.getDataRange().getValues();
  var settings = {
    adminPassword: "7014",
    adminEmail: "nitibangkok.horizon@gmail.com",
    agencyName: "Bangkok Horizon Ram 60 (นิติบุคคลอาคารชุด)",
    defaultContactPhone: "02-735-6060",
    defaultContactLine: "@052adooe",
    agencyAddress: "สำนักงานนิติบุคคลอาคารชุด แบงค์คอก ฮอไรซอน รามคำแหง 60 ซ.รามคำแหง 60 แขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ 10240",
    heroBackgroundImages: [],
    updatedAt: ""
  };

  var maxUpdatedAt = "";
  for (var i = 1; i < data.length; i++) {
    var rawKey = String(data[i][0] || "").trim();
    var lowerKey = rawKey.toLowerCase();
    var val = data[i][1];
    var updated = data[i][3];
    if (updated && String(updated) > maxUpdatedAt) {
      maxUpdatedAt = String(updated);
    }

    var key = rawKey;
    if (lowerKey === "adminpassword") key = "adminPassword";
    else if (lowerKey === "adminemail") key = "adminEmail";
    else if (lowerKey === "agencyname") key = "agencyName";
    else if (lowerKey === "defaultcontactphone") key = "defaultContactPhone";
    else if (lowerKey === "defaultcontactline") key = "defaultContactLine";
    else if (lowerKey === "agencyaddress") key = "agencyAddress";
    else if (lowerKey === "herobackgroundimages") key = "heroBackgroundImages";
    else if (lowerKey === "updatedat") key = "updatedAt";

    if (key) {
      if (key === "heroBackgroundImages") {
        settings[key] = safeJsonParse(val, []);
      } else {
        var strVal = String(val !== undefined && val !== null ? val : "").trim();
        if (strVal.startsWith("'")) {
          strVal = strVal.substring(1);
        }
        settings[key] = strVal;
      }
    }
  }
  settings.updatedAt = maxUpdatedAt || new Date().toISOString();

  return settings;
}

function saveSettingsData(newSettings) {
  if (!newSettings) return { success: false, error: "No settings provided" };
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    initSheetTabs(ss);
    sheet = ss.getSheetByName("Settings");
  }

  var data = sheet.getDataRange().getValues();
  var keyRowMap = {};
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][0] || "").trim().toLowerCase();
    if (k) keyRowMap[k] = i + 1;
  }

  var nowStr = new Date().toISOString();
  var keys = Object.keys(newSettings);

  for (var j = 0; j < keys.length; j++) {
    var key = keys[j];
    if (key === "googleWebAppUrl") continue;
    var value = newSettings[key];
    if (Array.isArray(value) || typeof value === "object") {
      value = JSON.stringify(value);
    } else {
      value = String(value !== undefined && value !== null ? value : "").trim();
    }

    var lowerKey = key.toLowerCase();
    if (keyRowMap[lowerKey]) {
      var rowIndex = keyRowMap[lowerKey];
      // Format as Plain Text (@) to preserve phone numbers and leading zeros
      sheet.getRange(rowIndex, 2).setNumberFormat("@").setValue("'" + value);
      sheet.getRange(rowIndex, 4).setValue(nowStr);
    } else {
      sheet.appendRow([key, "'" + value, "ตั้งค่าผ่าน Admin Portal", nowStr]);
      var newLastRow = sheet.getLastRow();
      sheet.getRange(newLastRow, 2).setNumberFormat("@");
      keyRowMap[lowerKey] = newLastRow;
    }
  }

  // Ensure column B format is text
  if (sheet.getLastRow() > 1) {
    try {
      sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).setNumberFormat("@");
    } catch(e) {}
  }

  return { success: true, settings: getSettingsData(), message: "บันทึกการตั้งค่าลง Google Sheet สำเร็จ" };
}

// --------------------------------------------------------------------------
// 9. UPLOAD FILE TO GOOGLE DRIVE WITH AUTOMATIC PER-ROOM FOLDER STRUCTURE
// --------------------------------------------------------------------------

function getOrCreateRoomFolder(roomNumber, subfolderType) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var rootFolderId = props.FOLDER_ID;
  if (!rootFolderId) {
    setupProject();
    rootFolderId = PropertiesService.getScriptProperties().getProperty("FOLDER_ID");
  }
  var rootFolder = DriveApp.getFolderById(rootFolderId);

  if (!roomNumber) {
    if (subfolderType === "facilities") {
      var facFolders = rootFolder.getFoldersByName("ส่วนกลาง_Facilities");
      if (facFolders.hasNext()) {
        return facFolders.next();
      } else {
        var newFacFolder = rootFolder.createFolder("ส่วนกลาง_Facilities");
        newFacFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return newFacFolder;
      }
    }
    return rootFolder;
  }

  var cleanRoomNum = String(roomNumber).trim().replace(/[\/\\:*?"<>|]/g, "-");
  var roomFolderName = "ห้อง_" + cleanRoomNum;

  var roomFolder = null;
  var roomFolders = rootFolder.getFoldersByName(roomFolderName);
  if (roomFolders.hasNext()) {
    roomFolder = roomFolders.next();
  } else {
    roomFolder = rootFolder.createFolder(roomFolderName);
    roomFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  if (subfolderType) {
    var subName = subfolderType === "contracts" ? "สัญญา_Contracts" : (subfolderType === "photos" ? "รูปภาพ_Photos" : subfolderType);
    var subFolders = roomFolder.getFoldersByName(subName);
    if (subFolders.hasNext()) {
      return subFolders.next();
    } else {
      var newSub = roomFolder.createFolder(subName);
      newSub.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return newSub;
    }
  }

  return roomFolder;
}

function uploadFileToDrive(base64Data, fileName, mimeType, roomNumber, subfolderType) {
  try {
    if (!base64Data) {
      return { success: false, error: "No base64 data provided" };
    }

    var targetFolder = getOrCreateRoomFolder(roomNumber, subfolderType);

    var cleanBase64 = base64Data;
    if (base64Data.indexOf("base64,") > -1) {
      cleanBase64 = base64Data.split("base64,")[1];
    }

    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, mimeType || "application/pdf", fileName || ("doc_" + Date.now()));
    var file = targetFolder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    var fileViewerUrl = "https://drive.google.com/file/d/" + fileId + "/view";
    var finalUrl = (mimeType === "application/pdf" || subfolderType === "contracts") ? fileViewerUrl : directUrl;

    return {
      success: true,
      fileId: fileId,
      fileName: file.getName(),
      url: finalUrl,
      directUrl: directUrl,
      viewUrl: directUrl,
      driveUrl: fileViewerUrl,
      folderName: targetFolder.getName(),
      folderUrl: targetFolder.getUrl()
    };
  } catch (err) {
    return {
      success: false,
      error: "Upload failed: " + err.toString()
    };
  }
}

// --------------------------------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------------------------------

function safeJsonParse(val, fallback) {
  if (val === undefined || val === null || val === "") return fallback;
  if (Array.isArray(val) || (typeof val === "object" && val !== null)) return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    if (typeof val === "string" && val.indexOf(",") > -1) {
      return val.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    } else if (typeof val === "string" && val.trim().length > 0) {
      return [val.trim()];
    }
    return fallback;
  }
}

function parseBoolean(val, fallback) {
  if (val === undefined || val === null || val === "") return fallback !== undefined ? fallback : false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  var s = String(val).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "y" || s === "t" || s === "ใช่") return true;
  if (s === "false" || s === "0" || s === "no" || s === "n" || s === "f" || s === "ไม่") return false;
  return fallback !== undefined ? fallback : false;
}

function parseNumber(val, defaultVal) {
  if (val === undefined || val === null || val === "") return defaultVal !== undefined ? defaultVal : 0;
  if (typeof val === "number") return isNaN(val) ? (defaultVal || 0) : val;
  var cleaned = String(val).replace(/,/g, "").trim();
  var num = Number(cleaned);
  return isNaN(num) ? (defaultVal !== undefined ? defaultVal : 0) : num;
}

function formatDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "GMT+7", "yyyy-MM-dd");
  }
  return String(val);
}

function formatIsoOrDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return val.toISOString();
  }
  return String(val);
}
