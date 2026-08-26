/**
 * Generates backend/data/db.json with all sample dates computed relative to
 * "now", so the demo (near-expiry alerts, surge detection, in-transit
 * shipments) stays meaningful no matter when the project is actually run.
 *
 * Run again any time with: npm run reseed
 */
const fs = require("fs");
const path = require("path");
const { hashPassword } = require("./utils/security");
const { computeProvenanceChecksum } = require("./utils/mlEngine");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY).toISOString();
const daysFromNow = (n) => new Date(now + n * DAY).toISOString().slice(0, 10);

const MFG = "Sunrise Pharma";
const checksum = (batch) => computeProvenanceChecksum(batch, MFG);

const db = {
  users: [
    { id: 1, name: "Regulatory Admin", email: "admin@gmail.com", passwordHash: hashPassword("admin12"), role: "admin", mfaEnabled: true },
    { id: 2, name: "Metro Distribution Co.", email: "dis@gmail.com", passwordHash: hashPassword("dis12"), role: "distributor", licenseVerified: true },
    { id: 3, name: "Sunrise Pharma Vendor", email: "vendor@gmail.com", passwordHash: hashPassword("vendor12"), role: "vendor", licenseVerified: true },
    // Demo client accounts (last-mile portal). All share the password
    // "client123" for easy demoing. Distributor -> Clients -> Add Client
    // provisions more the same way for the remaining real institutions.
    { id: 4, name: "Cityview Pharmacy", email: "client1@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: true },
    { id: 5, name: "Green Valley Hospital", email: "client2@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: true },
    { id: 6, name: "Sunrise Community Clinic", email: "client3@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: true },
    { id: 7, name: "Lakeside Medical Institute", email: "client4@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: false },
    { id: 8, name: "Harborview Pharmacy", email: "client5@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: true },
    { id: 9, name: "St. Mary's Hospital", email: "client6@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: true },
    { id: 10, name: "Northgate Clinic", email: "client7@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: true },
    { id: 11, name: "Riverside Institution", email: "client8@gmail.com", passwordHash: hashPassword("client123"), role: "client", licenseVerified: false },
  ],

  // The ~50 medicals/institutions a distributor serves. Seeded with 8
  // representative accounts across all 4 regions; Distributor -> Clients ->
  // Add Client onboards the rest the same way.
  clients: [
    { id: 1, userId: 4, name: "Cityview Pharmacy", type: "Pharmacy", region: "North Zone", contactPerson: "R. Mehta", phone: "+91-98000-11111", email: "client1@gmail.com", licenseVerified: true, onboardedAt: daysAgo(40) },
    { id: 2, userId: 5, name: "Green Valley Hospital", type: "Hospital", region: "South Zone", contactPerson: "Dr. A. Rao", phone: "+91-98000-22222", email: "client2@gmail.com", licenseVerified: true, onboardedAt: daysAgo(38) },
    { id: 3, userId: 6, name: "Sunrise Community Clinic", type: "Clinic", region: "East Zone", contactPerson: "Dr. S. Iyer", phone: "+91-98000-33333", email: "client3@gmail.com", licenseVerified: true, onboardedAt: daysAgo(30) },
    { id: 4, userId: 7, name: "Lakeside Medical Institute", type: "Institution", region: "West Zone", contactPerson: "K. Nair", phone: "+91-98000-44444", email: "client4@gmail.com", licenseVerified: false, onboardedAt: daysAgo(5) },
    { id: 5, userId: 8, name: "Harborview Pharmacy", type: "Pharmacy", region: "South Zone", contactPerson: "P. Sharma", phone: "+91-98000-55555", email: "client5@gmail.com", licenseVerified: true, onboardedAt: daysAgo(25) },
    { id: 6, userId: 9, name: "St. Mary's Hospital", type: "Hospital", region: "North Zone", contactPerson: "Dr. L. Fernandes", phone: "+91-98000-66666", email: "client6@gmail.com", licenseVerified: true, onboardedAt: daysAgo(33) },
    { id: 7, userId: 10, name: "Northgate Clinic", type: "Clinic", region: "North Zone", contactPerson: "Dr. M. Verma", phone: "+91-98000-77777", email: "client7@gmail.com", licenseVerified: true, onboardedAt: daysAgo(20) },
    { id: 8, userId: 11, name: "Riverside Institution", type: "Institution", region: "East Zone", contactPerson: "T. Das", phone: "+91-98000-88888", email: "client8@gmail.com", licenseVerified: false, onboardedAt: daysAgo(2) },
  ],

  // Client -> Distributor requests (the last-mile leg).
  clientRequests: [
    {
      id: 1, clientId: 1, clientName: "Cityview Pharmacy", drugName: "Paracetamol 500mg", qtyRequested: 80, region: "North Zone", priority: "routine",
      status: "received", createdAt: daysAgo(9), approvedAt: daysAgo(8), dispatchedAt: daysAgo(8), receivedAt: daysAgo(7),
      qtyDispatched: 80, qtyReceived: 80,
      batchesAllocated: [{ batch: "PCM-2603", qty: 80, expiryDate: daysFromNow(260), unitPrice: 1.45, coldChain: false }],
      gpsLog: [
        { lat: 12.9716, lng: 77.5946, timestamp: daysAgo(8), label: "Departed Distributor Hub" },
        { lat: 12.99, lng: 77.61, timestamp: daysAgo(7), label: "Arrived at Cityview Pharmacy" },
      ],
      coldChainLog: [], rejectionReason: null,
    },
    {
      id: 2, clientId: 2, clientName: "Green Valley Hospital", drugName: "Insulin Glargine 100IU", qtyRequested: 20, region: "South Zone", priority: "critical",
      status: "dispatched", createdAt: daysAgo(1.2), approvedAt: daysAgo(0.8), dispatchedAt: daysAgo(0.8), receivedAt: null,
      qtyDispatched: 20, qtyReceived: null,
      batchesAllocated: [{ batch: "INS-7742-B", qty: 20, expiryDate: daysFromNow(6), unitPrice: 18.75, coldChain: true }],
      gpsLog: [{ lat: 12.9716, lng: 77.5946, timestamp: daysAgo(0.8), label: "Departed Distributor Hub" }],
      coldChainLog: [{ temp: 5.0, humidity: 40, timestamp: daysAgo(0.8), alert: false }],
      rejectionReason: null,
    },
    {
      id: 3, clientId: 6, clientName: "St. Mary's Hospital", drugName: "Azithromycin 500mg", qtyRequested: 150, region: "North Zone", priority: "urgent",
      status: "pending", createdAt: daysAgo(0.3), approvedAt: null, dispatchedAt: null, receivedAt: null,
      qtyDispatched: null, qtyReceived: null, batchesAllocated: [], gpsLog: [], coldChainLog: [], rejectionReason: null,
    },
    {
      // Demonstrates quantity-mismatch detection on the last-mile leg.
      id: 4, clientId: 5, clientName: "Harborview Pharmacy", drugName: "Metformin 500mg", qtyRequested: 60, region: "South Zone", priority: "routine",
      status: "received", createdAt: daysAgo(14), approvedAt: daysAgo(13), dispatchedAt: daysAgo(13), receivedAt: daysAgo(12),
      qtyDispatched: 60, qtyReceived: 50,
      batchesAllocated: [{ batch: "MET-3350", qty: 60, expiryDate: daysFromNow(330), unitPrice: 1.1, coldChain: false }],
      gpsLog: [
        { lat: 12.9716, lng: 77.5946, timestamp: daysAgo(13), label: "Departed Distributor Hub" },
        { lat: 12.95, lng: 77.58, timestamp: daysAgo(12), label: "Arrived at Harborview Pharmacy" },
      ],
      coldChainLog: [], rejectionReason: null,
    },
  ],

  regions: [
    { id: 1, name: "North Zone" },
    { id: 2, name: "South Zone" },
    { id: 3, name: "East Zone" },
    { id: 4, name: "West Zone" },
  ],

  // Each entry is one BATCH of a drug. Multiple batches of the same drug
  // with different expiry dates is what makes FEFO allocation meaningful.
  vendorInventory: [
    { id: 1, drugName: "Paracetamol 500mg", category: "Analgesic", batch: "PCM-2603", manufacturer: MFG, stock: 420, reorderPoint: 150, unitPrice: 1.2, expiryDate: daysFromNow(260), coldChain: false, provenanceChecksum: checksum("PCM-2603") },
    { id: 2, drugName: "Paracetamol 500mg", category: "Analgesic", batch: "PCM-2410", manufacturer: MFG, stock: 80, reorderPoint: 150, unitPrice: 1.2, expiryDate: daysFromNow(14), coldChain: false, provenanceChecksum: checksum("PCM-2410") },
    { id: 3, drugName: "Amoxicillin 250mg", category: "Antibiotic", batch: "AMX-1187", manufacturer: MFG, stock: 90, reorderPoint: 120, unitPrice: 2.5, expiryDate: daysFromNow(21), coldChain: false, provenanceChecksum: checksum("AMX-1187") },
    { id: 4, drugName: "Insulin Glargine 100IU", category: "Hormone", batch: "INS-7742", manufacturer: MFG, stock: 60, reorderPoint: 40, unitPrice: 18.75, expiryDate: daysFromNow(6), coldChain: true, provenanceChecksum: checksum("INS-7742") },
    { id: 5, drugName: "Azithromycin 500mg", category: "Antibiotic", batch: "AZI-4410", manufacturer: MFG, stock: 210, reorderPoint: 100, unitPrice: 3.8, expiryDate: daysFromNow(150), coldChain: false, provenanceChecksum: "TAMPERED0X9" }, // intentionally corrupted for the counterfeit-flag demo
    { id: 6, drugName: "Ceftriaxone 1g Injection", category: "Antibiotic", batch: "CFX-2299", manufacturer: MFG, stock: 35, reorderPoint: 50, unitPrice: 6.4, expiryDate: daysFromNow(105), coldChain: true, provenanceChecksum: checksum("CFX-2299") },
    { id: 7, drugName: "ORS Sachets", category: "Rehydration", batch: "ORS-0091", manufacturer: MFG, stock: 500, reorderPoint: 200, unitPrice: 0.4, expiryDate: daysFromNow(450), coldChain: false, provenanceChecksum: checksum("ORS-0091") },
  ],

  distributorInventory: [
    { id: 1, drugName: "Paracetamol 500mg", category: "Analgesic", batch: "PCM-2603", manufacturer: MFG, region: "North Zone", stock: 160, reorderPoint: 100, unitPrice: 1.45, expiryDate: daysFromNow(260), coldChain: false, provenanceChecksum: checksum("PCM-2603") },
    { id: 2, drugName: "Amoxicillin 250mg", category: "Antibiotic", batch: "AMX-1187", manufacturer: MFG, region: "North Zone", stock: 40, reorderPoint: 80, unitPrice: 2.9, expiryDate: daysFromNow(21), coldChain: false, provenanceChecksum: checksum("AMX-1187") },
    { id: 3, drugName: "Metformin 500mg", category: "Antidiabetic", batch: "MET-3350", manufacturer: MFG, region: "South Zone", stock: 300, reorderPoint: 120, unitPrice: 1.1, expiryDate: daysFromNow(330), coldChain: false, provenanceChecksum: checksum("MET-3350") },
    { id: 4, drugName: "Paracetamol 500mg", category: "Analgesic", batch: "PCM-OLD01", manufacturer: MFG, region: "South Zone", stock: 20, reorderPoint: 100, unitPrice: 1.45, expiryDate: daysFromNow(8), coldChain: false, provenanceChecksum: checksum("PCM-OLD01") },
    { id: 5, drugName: "Insulin Glargine 100IU", category: "Hormone", batch: "INS-7742-B", manufacturer: MFG, region: "South Zone", stock: 5, reorderPoint: 20, unitPrice: 18.75, expiryDate: daysFromNow(6), coldChain: true, provenanceChecksum: checksum("INS-7742-B") },
  ],

  // Distributor -> Vendor stock requests (correct real-world direction:
  // the distributor is the one running low and asks the manufacturer).
  stockRequests: [
    {
      id: 1, drugName: "Amoxicillin 250mg", qtyRequested: 200, region: "North Zone", priority: "routine",
      status: "received", requestedBy: "distributor",
      createdAt: daysAgo(12), approvedAt: daysAgo(11), dispatchedAt: daysAgo(11), receivedAt: daysAgo(9),
      qtyDispatched: 200, qtyReceived: 200,
      batchesAllocated: [{ batch: "AMX-1187", qty: 200, expiryDate: daysFromNow(21), unitPrice: 2.5, coldChain: false }],
      gpsLog: [
        { lat: 12.9716, lng: 77.5946, timestamp: daysAgo(11), label: "Departed Vendor Warehouse" },
        { lat: 13.0827, lng: 80.2707, timestamp: daysAgo(9), label: "Arrived Distributor Hub" },
      ],
      coldChainLog: [], rejectionReason: null,
    },
    {
      id: 2, drugName: "Insulin Glargine 100IU", qtyRequested: 50, region: "South Zone", priority: "urgent",
      status: "dispatched", requestedBy: "distributor",
      createdAt: daysAgo(3), approvedAt: daysAgo(2), dispatchedAt: daysAgo(2), receivedAt: null,
      qtyDispatched: 50, qtyReceived: null,
      batchesAllocated: [{ batch: "INS-7742", qty: 50, expiryDate: daysFromNow(6), unitPrice: 18.75, coldChain: true }],
      gpsLog: [
        { lat: 12.9716, lng: 77.5946, timestamp: daysAgo(2), label: "Departed Vendor Warehouse" },
        { lat: 13.01, lng: 78.4, timestamp: daysAgo(1), label: "In Transit - Highway Checkpoint" },
      ],
      coldChainLog: [
        { temp: 5.1, humidity: 42, timestamp: daysAgo(2), alert: false },
        { temp: 4.8, humidity: 40, timestamp: daysAgo(1), alert: false },
      ],
      rejectionReason: null,
    },
    {
      id: 3, drugName: "Ceftriaxone 1g Injection", qtyRequested: 100, region: "North Zone", priority: "critical",
      status: "pending", requestedBy: "distributor",
      createdAt: daysAgo(0.4), approvedAt: null, dispatchedAt: null, receivedAt: null,
      qtyDispatched: null, qtyReceived: null, batchesAllocated: [], gpsLog: [], coldChainLog: [], rejectionReason: null,
    },
    {
      // Demonstrates quantity-mismatch detection: 150 dispatched, only 130 confirmed received.
      id: 4, drugName: "Paracetamol 500mg", qtyRequested: 150, region: "South Zone", priority: "routine",
      status: "received", requestedBy: "distributor",
      createdAt: daysAgo(20), approvedAt: daysAgo(19), dispatchedAt: daysAgo(19), receivedAt: daysAgo(17),
      qtyDispatched: 150, qtyReceived: 130,
      batchesAllocated: [{ batch: "PCM-2410", qty: 150, expiryDate: daysFromNow(14), unitPrice: 1.2, coldChain: false }],
      gpsLog: [
        { lat: 12.9716, lng: 77.5946, timestamp: daysAgo(19), label: "Departed Vendor Warehouse" },
        { lat: 13.0827, lng: 80.2707, timestamp: daysAgo(17), label: "Arrived Distributor Hub" },
      ],
      coldChainLog: [], rejectionReason: null,
    },
  ],

  // Sales history: mostly steady, with a sharp Azithromycin spike in the
  // last 2 days to demonstrate surge detection (flu-outbreak scenario).
  sales: [
    { id: 1, drugName: "Paracetamol 500mg", batch: "PCM-2603", qty: 60, unitPrice: 1.45, amount: 87, buyer: "Cityview Pharmacy", date: daysAgo(15) },
    { id: 2, drugName: "Paracetamol 500mg", batch: "PCM-2603", qty: 55, unitPrice: 1.45, amount: 79.75, buyer: "Green Valley Hospital", date: daysAgo(10) },
    { id: 3, drugName: "Paracetamol 500mg", batch: "PCM-2603", qty: 70, unitPrice: 1.45, amount: 101.5, buyer: "Cityview Pharmacy", date: daysAgo(5) },
    { id: 17, drugName: "Paracetamol 500mg", batch: "PCM-2603", qty: 65, unitPrice: 1.45, amount: 94.25, buyer: "Green Valley Hospital", date: daysAgo(12) },
    { id: 18, drugName: "Paracetamol 500mg", batch: "PCM-2603", qty: 58, unitPrice: 1.45, amount: 84.1, buyer: "Cityview Pharmacy", date: daysAgo(8) },
    { id: 19, drugName: "Paracetamol 500mg", batch: "PCM-2603", qty: 72, unitPrice: 1.45, amount: 104.4, buyer: "Green Valley Hospital", date: daysAgo(3) },
    { id: 4, drugName: "Amoxicillin 250mg", batch: "AMX-1187", qty: 30, unitPrice: 2.9, amount: 87, buyer: "Green Valley Hospital", date: daysAgo(13) },
    { id: 5, drugName: "Amoxicillin 250mg", batch: "AMX-1187", qty: 35, unitPrice: 2.9, amount: 101.5, buyer: "Cityview Pharmacy", date: daysAgo(6) },
    { id: 20, drugName: "Amoxicillin 250mg", batch: "AMX-1187", qty: 28, unitPrice: 2.9, amount: 81.2, buyer: "Green Valley Hospital", date: daysAgo(11) },
    { id: 21, drugName: "Amoxicillin 250mg", batch: "AMX-1187", qty: 32, unitPrice: 2.9, amount: 92.8, buyer: "Cityview Pharmacy", date: daysAgo(9) },
    { id: 22, drugName: "Amoxicillin 250mg", batch: "AMX-1187", qty: 33, unitPrice: 2.9, amount: 95.7, buyer: "Green Valley Hospital", date: daysAgo(4) },
    { id: 6, drugName: "Metformin 500mg", batch: "MET-3350", qty: 90, unitPrice: 1.1, amount: 99, buyer: "Cityview Pharmacy", date: daysAgo(9) },
    { id: 7, drugName: "Metformin 500mg", batch: "MET-3350", qty: 85, unitPrice: 1.1, amount: 93.5, buyer: "Green Valley Hospital", date: daysAgo(2) },
    { id: 23, drugName: "Metformin 500mg", batch: "MET-3350", qty: 88, unitPrice: 1.1, amount: 96.8, buyer: "Cityview Pharmacy", date: daysAgo(14) },
    { id: 24, drugName: "Metformin 500mg", batch: "MET-3350", qty: 92, unitPrice: 1.1, amount: 101.2, buyer: "Green Valley Hospital", date: daysAgo(7) },
    { id: 25, drugName: "Metformin 500mg", batch: "MET-3350", qty: 86, unitPrice: 1.1, amount: 94.6, buyer: "Cityview Pharmacy", date: daysAgo(1) },
    { id: 26, drugName: "Insulin Glargine 100IU", batch: "INS-7742", qty: 11, unitPrice: 18.75, amount: 206.25, buyer: "Green Valley Hospital", date: daysAgo(16) },
    { id: 27, drugName: "Insulin Glargine 100IU", batch: "INS-7742", qty: 13, unitPrice: 18.75, amount: 243.75, buyer: "St. Mary's Hospital", date: daysAgo(10) },
    { id: 28, drugName: "Insulin Glargine 100IU", batch: "INS-7742", qty: 12, unitPrice: 18.75, amount: 225, buyer: "Green Valley Hospital", date: daysAgo(5) },
    { id: 35, drugName: "Insulin Glargine 100IU", batch: "INS-7742", qty: 12, unitPrice: 18.75, amount: 225, buyer: "St. Mary's Hospital", date: daysAgo(13) },
    { id: 36, drugName: "Insulin Glargine 100IU", batch: "INS-7742", qty: 11, unitPrice: 18.75, amount: 206.25, buyer: "Green Valley Hospital", date: daysAgo(2) },
    { id: 29, drugName: "Ceftriaxone 1g Injection", batch: "CFX-2299", qty: 9, unitPrice: 6.4, amount: 57.6, buyer: "Green Valley Hospital", date: daysAgo(14) },
    { id: 30, drugName: "Ceftriaxone 1g Injection", batch: "CFX-2299", qty: 11, unitPrice: 6.4, amount: 70.4, buyer: "St. Mary's Hospital", date: daysAgo(8) },
    { id: 31, drugName: "Ceftriaxone 1g Injection", batch: "CFX-2299", qty: 10, unitPrice: 6.4, amount: 64, buyer: "Green Valley Hospital", date: daysAgo(3) },
    { id: 37, drugName: "Ceftriaxone 1g Injection", batch: "CFX-2299", qty: 10, unitPrice: 6.4, amount: 64, buyer: "St. Mary's Hospital", date: daysAgo(11) },
    { id: 38, drugName: "Ceftriaxone 1g Injection", batch: "CFX-2299", qty: 9, unitPrice: 6.4, amount: 57.6, buyer: "Green Valley Hospital", date: daysAgo(1) },
    { id: 32, drugName: "ORS Sachets", batch: "ORS-0091", qty: 58, unitPrice: 0.4, amount: 23.2, buyer: "Cityview Pharmacy", date: daysAgo(12) },
    { id: 33, drugName: "ORS Sachets", batch: "ORS-0091", qty: 62, unitPrice: 0.4, amount: 24.8, buyer: "Green Valley Hospital", date: daysAgo(6) },
    { id: 34, drugName: "ORS Sachets", batch: "ORS-0091", qty: 55, unitPrice: 0.4, amount: 22, buyer: "Cityview Pharmacy", date: daysAgo(2) },
    { id: 39, drugName: "ORS Sachets", batch: "ORS-0091", qty: 60, unitPrice: 0.4, amount: 24, buyer: "Green Valley Hospital", date: daysAgo(9) },
    { id: 40, drugName: "ORS Sachets", batch: "ORS-0091", qty: 57, unitPrice: 0.4, amount: 22.8, buyer: "Cityview Pharmacy", date: daysAgo(4) },
    // Azithromycin baseline (~4-5 units/day average over the last ~2.5 weeks)
    { id: 8, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 8, unitPrice: 3.8, amount: 30.4, buyer: "Cityview Pharmacy", date: daysAgo(17) },
    { id: 9, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 7, unitPrice: 3.8, amount: 26.6, buyer: "Green Valley Hospital", date: daysAgo(15) },
    { id: 10, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 9, unitPrice: 3.8, amount: 34.2, buyer: "Cityview Pharmacy", date: daysAgo(13) },
    { id: 11, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 6, unitPrice: 3.8, amount: 22.8, buyer: "Green Valley Hospital", date: daysAgo(11) },
    { id: 12, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 8, unitPrice: 3.8, amount: 30.4, buyer: "Cityview Pharmacy", date: daysAgo(9) },
    { id: 13, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 7, unitPrice: 3.8, amount: 26.6, buyer: "Green Valley Hospital", date: daysAgo(7) },
    { id: 14, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 5, unitPrice: 3.8, amount: 19, buyer: "Cityview Pharmacy", date: daysAgo(5) },
    // Sudden spike — last 2 days, ~15x the baseline rate (outbreak scenario)
    { id: 15, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 95, unitPrice: 3.8, amount: 361, buyer: "Green Valley Hospital", date: daysAgo(1.5) },
    { id: 16, drugName: "Azithromycin 500mg", batch: "AZI-4410", qty: 120, unitPrice: 3.8, amount: 456, buyer: "Cityview Pharmacy", date: daysAgo(0.5) },
  ],

  // Billing invoices generated when the vendor approves a stock request.
  billing: [
    { id: 1, requestId: 1, drugName: "Amoxicillin 250mg", amount: 500, status: "paid", date: daysAgo(11) },
    { id: 2, requestId: 2, drugName: "Insulin Glargine 100IU", amount: 937.5, status: "pending", date: daysAgo(2) },
    { id: 3, requestId: 4, drugName: "Paracetamol 500mg", amount: 180, status: "paid", date: daysAgo(19) },
  ],

  anomalies: [
    {
      id: 1, type: "quantity-mismatch", drugName: "Paracetamol 500mg", batch: "PCM-2410", severity: "medium",
      detectedAt: daysAgo(17), status: "open", source: "distributor",
      message: "Stock request #4: 150 units dispatched but only 130 confirmed received (13.3% shortfall).",
    },
    {
      id: 2, type: "quantity-mismatch", drugName: "Metformin 500mg", batch: "MET-3350", severity: "medium",
      detectedAt: daysAgo(12), status: "open", source: "client",
      message: "Client request #4 (Harborview Pharmacy): 60 units dispatched but only 50 confirmed received (16.7% shortfall).",
    },
  ],

  // General sensor history (separate from the per-shipment log embedded in
  // stockRequests) — represents ongoing IoT monitoring, including of stock
  // still sitting in a portal's own warehouse, not just in transit.
  coldChainLogs: [
    { id: 1, portal: "vendor", batch: "INS-7742", temp: 4.9, humidity: 39, timestamp: daysAgo(6), alert: false },
    { id: 2, portal: "vendor", batch: "INS-7742", temp: 5.3, humidity: 41, timestamp: daysAgo(3), alert: false },
    { id: 3, portal: "vendor", batch: "CFX-2299", temp: 6.1, humidity: 44, timestamp: daysAgo(4), alert: false },
    { id: 4, portal: "distributor", batch: "INS-7742", temp: 5.1, humidity: 42, timestamp: daysAgo(2), alert: false },
    { id: 5, portal: "distributor", batch: "INS-7742", temp: 4.8, humidity: 40, timestamp: daysAgo(1), alert: false },
  ],

  supplierPerformance: [
    { vendorName: "Sunrise Pharma Vendor", onTimeDeliveryRate: 92, qualityScore: 4.6, avgResponseHours: 5.2, ordersFulfilled: 38 },
  ],

  settings: { emergencyMode: false, updatedAt: null, updatedBy: null },

  recalls: [],
  productionRuns: [],
  // On-hand stock actually sitting at each client's facility — seeded to
  // match the already-received requests above (id 1 and id 4), since those
  // were received before this seed ran rather than through the live route.
  clientInventory: [
    { id: 1, clientId: 1, clientName: "Cityview Pharmacy", drugName: "Paracetamol 500mg", batch: "PCM-2603", manufacturer: MFG, stock: 80, reorderPoint: 10, unitPrice: 1.45, expiryDate: daysFromNow(260), coldChain: false, provenanceChecksum: checksum("PCM-2603") },
    { id: 2, clientId: 5, clientName: "Harborview Pharmacy", drugName: "Metformin 500mg", batch: "MET-3350", manufacturer: MFG, stock: 50, reorderPoint: 10, unitPrice: 1.1, expiryDate: daysFromNow(330), coldChain: false, provenanceChecksum: checksum("MET-3350") },
  ],
  clientUsageLog: [],

  blockchain: [],
};

fs.writeFileSync(path.join(__dirname, "data", "db.json"), JSON.stringify(db, null, 2), "utf-8");
console.log("✅ Seed data generated at backend/data/db.json (dates relative to now).");
