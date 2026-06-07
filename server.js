const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new Database('database.db');

app.use(cors());
app.use(express.json());

// --- 1. SERVE STATIC FILES from /public ---
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. DATABASE SCHEMA INITIALIZATION ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    dob TEXT NOT NULL,
    role TEXT DEFAULT 'client'
  );

  CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT,
    name TEXT NOT NULL,
    gender TEXT CHECK(gender IN ('Male', 'Female', 'Other')) DEFAULT 'Other',
    dob TEXT NOT NULL,
    FOREIGN KEY(user_phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT,
    address_line TEXT NOT NULL,
    is_default INTEGER CHECK(is_default IN (0, 1)) DEFAULT 0,
    FOREIGN KEY(user_phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('RENTAL', 'CONSUMABLE')) NOT NULL,
    category TEXT NOT NULL,
    theme TEXT NOT NULL,
    age_group TEXT NOT NULL,
    material TEXT NOT NULL,
    price REAL NOT NULL,
    max_inventory INTEGER NOT NULL,
    images_json TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT,
    items_json TEXT NOT NULL,
    event_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('PENDING', 'REVIEWED', 'ORDERED', 'DELIVERED', 'READY TO PICK UP', 'COMPLETED', 'CANCELLED')) DEFAULT 'PENDING',
    admin_notes TEXT DEFAULT '',
    total_price REAL NOT NULL,
    address_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(customer_phone) REFERENCES users(phone),
    FOREIGN KEY(address_id) REFERENCES addresses(id)
  );
`);

// Safe migrations for existing databases
const safeAlter = (sql) => { try { db.prepare(sql).run(); } catch(e) {} };
safeAlter("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'client'");
safeAlter("ALTER TABLE items ADD COLUMN is_active INTEGER DEFAULT 1");
safeAlter("ALTER TABLE orders ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))");
safeAlter("ALTER TABLE users ADD COLUMN dob TEXT NOT NULL DEFAULT ''");

// --- SEED INVENTORY ---
const itemCheck = db.prepare("SELECT COUNT(*) as count FROM items").get();
if (itemCheck.count === 0) {
  const insertItem = db.prepare(`
    INSERT INTO items (name, type, category, theme, age_group, material, price, max_inventory, images_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertItem.run("Gold Ring Backdrop Stand (7ft)", "RENTAL", "Backdrop", "Anniversary", "Adults", "Metal", 450.00, 25,
    JSON.stringify(["https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=400","https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400"]));
  insertItem.run("Traditional Haldi Marigold Screen", "RENTAL", "Backdrop", "Haldi", "Any", "Fabric", 350.00, 15,
    JSON.stringify(["https://images.unsplash.com/photo-1605001011156-cbf0b0f67a51?w=400","https://images.unsplash.com/photo-1596751303335-74f358c60dfa?w=400"]));
  insertItem.run("Jungle Safari Arch Framework", "RENTAL", "Backdrop", "Jungle", "Kids", "Wood", 500.00, 10,
    JSON.stringify(["https://images.unsplash.com/photo-1533294160622-d5fece3e080d?w=400","https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400"]));
  insertItem.run("Geometric Hexagon Metal Stand", "RENTAL", "Backdrop", "Birthday", "Any", "Metal", 480.00, 12,
    JSON.stringify(["https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400","https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=400"]));
  insertItem.run("LED Neon 'Happy Birthday' Sign", "RENTAL", "Signage", "Birthday", "Any", "Neon", 250.00, 30,
    JSON.stringify(["https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400"]));
  insertItem.run("LED Neon 'Better Together' Board", "RENTAL", "Signage", "Anniversary", "Adults", "Neon", 300.00, 15,
    JSON.stringify(["https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=400"]));
  insertItem.run("Vintage Welcome Easel Stand", "RENTAL", "Signage", "Any", "Any", "Wood", 150.00, 20,
    JSON.stringify(["https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400"]));
  insertItem.run("Premium Royal Flower Vases (Set of 2)", "RENTAL", "Props", "Any", "Any", "Metal", 180.00, 40,
    JSON.stringify(["https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?w=400"]));
  insertItem.run("Plush Birthday Cake Table Pedestals", "RENTAL", "Props", "Birthday", "Kids", "Acrylic", 220.00, 15,
    JSON.stringify(["https://images.unsplash.com/photo-1464349172961-4649a2868c2b?w=400"]));
  insertItem.run("Pastel Macaron Balloons (Pack of 100)", "CONSUMABLE", "Balloons", "Any", "Any", "Rubber", 95.00, 500,
    JSON.stringify(["https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400"]));
  insertItem.run("Metallic Gold Balloon Garland Roll", "CONSUMABLE", "Balloons", "Any", "Any", "Rubber", 120.00, 300,
    JSON.stringify(["https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400"]));
  insertItem.run("Custom Eco-Friendly Seed Mug Favors", "CONSUMABLE", "Return Gifts", "Any", "Any", "Clay", 60.00, 1000,
    JSON.stringify(["https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400"]));

  console.log("🌱 12-Item catalog seeded.");
}

// =========================================================================
// AUTH ROUTES
// =========================================================================

app.post('/api/auth/register', (req, res) => {
  const { name, phone, email, dob, password } = req.body;
  if (!name || !phone || !email || !dob || !password) {
    return res.status(400).json({ success: false, message: "All fields are mandatory." });
  }
  try {
    const exists = db.prepare("SELECT phone FROM users WHERE phone = ?").get(phone);
    if (exists) return res.status(400).json({ success: false, message: "This mobile number is already registered." });

    db.prepare("INSERT INTO users (name, phone, email, password, dob, role) VALUES (?, ?, ?, ?, ?, 'client')").run(name, phone, email, password, dob);
    res.json({ success: true, message: "Profile created successfully." });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({ success: false, message: "Registration failed: " + err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ success: false, message: "Credentials cannot be blank." });

  try {
    const user = db.prepare("SELECT * FROM users WHERE phone = ? AND password = ?").get(phone, password);
    if (!user) return res.status(401).json({ success: false, message: "Invalid mobile number or password." });

    // Admin override: hardcoded phone OR role column
    const isAdmin = (phone === '9538595501' || user.role === 'admin');
    const role = isAdmin ? 'admin' : 'client';

    // Update role in DB if admin phone but not yet marked
    if (isAdmin && user.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE phone = ?").run(phone);
    }

    res.json({ success: true, user: { name: user.name, phone: user.phone, email: user.email, role } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Login error." });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  const { phone, newPassword } = req.body;
  if (!phone || !newPassword) return res.status(400).json({ success: false, message: "Phone and new password required." });

  const user = db.prepare("SELECT phone FROM users WHERE phone = ?").get(phone);
  if (!user) return res.status(404).json({ success: false, message: "No account found with that phone number." });

  db.prepare("UPDATE users SET password = ? WHERE phone = ?").run(newPassword, phone);
  res.json({ success: true, message: "Password reset successfully." });
});

app.put('/api/auth/update-profile', (req, res) => {
  const { phone, addresses, defaultAddressIndex, family, password } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: "User phone required." });

  try {
    const updateTx = db.transaction(() => {
      if (password && password.trim() !== "") {
        db.prepare("UPDATE users SET password = ? WHERE phone = ?").run(password, phone);
      }

      if (addresses && Array.isArray(addresses)) {
        db.prepare("DELETE FROM addresses WHERE user_phone = ?").run(phone);
        const insertAddr = db.prepare("INSERT INTO addresses (user_phone, address_line, is_default) VALUES (?, ?, ?)");
        const defaultIdx = Number(defaultAddressIndex || 0);
        addresses.forEach((addr, idx) => {
          if (addr && addr.trim() !== "") {
            insertAddr.run(phone, addr.trim(), idx === defaultIdx ? 1 : 0);
          }
        });
      }

      if (family && Array.isArray(family)) {
        db.prepare("DELETE FROM family_members WHERE user_phone = ?").run(phone);
        const insertFam = db.prepare("INSERT INTO family_members (user_phone, name, gender, dob) VALUES (?, ?, ?, ?)");
        family.forEach(m => {
          if (m.name && m.name.trim() !== "") {
            insertFam.run(phone, m.name.trim(), m.gender || 'Other', m.dob || '');
          }
        });
      }
    });

    updateTx();
    res.json({ success: true, message: "Profile updated successfully." });
  } catch (err) {
    console.error("Profile update error:", err.message);
    res.status(500).json({ success: false, message: "Update failed: " + err.message });
  }
});

// =========================================================================
// PROFILE ROUTES
// =========================================================================

app.post('/api/profile/address', (req, res) => {
  const { user_phone, address_line, is_default } = req.body;
  const count = db.prepare("SELECT COUNT(*) as count FROM addresses WHERE user_phone = ?").get(user_phone);
  if (count.count >= 5) return res.status(400).json({ success: false, message: "Maximum 5 addresses allowed." });

  if (is_default === 1) db.prepare("UPDATE addresses SET is_default = 0 WHERE user_phone = ?").run(user_phone);
  const finalDefault = count.count === 0 ? 1 : (is_default || 0);
  const info = db.prepare("INSERT INTO addresses (user_phone, address_line, is_default) VALUES (?, ?, ?)").run(user_phone, address_line, finalDefault);
  res.json({ success: true, addressId: info.lastInsertRowid });
});

app.get('/api/profile/address/:phone', (req, res) => {
  const nodes = db.prepare("SELECT * FROM addresses WHERE user_phone = ? ORDER BY is_default DESC").all(req.params.phone);
  res.json(nodes);
});

app.post('/api/profile/family', (req, res) => {
  const { user_phone, name, gender, dob } = req.body;
  if (!user_phone || !name || !gender || !dob) return res.status(400).json({ success: false, message: "Missing fields." });
  db.prepare("INSERT INTO family_members (user_phone, name, gender, dob) VALUES (?, ?, ?, ?)").run(user_phone, name, gender, dob);
  res.json({ success: true });
});

app.get('/api/profile/family/:phone', (req, res) => {
  const members = db.prepare("SELECT * FROM family_members WHERE user_phone = ?").all(req.params.phone);
  res.json(members);
});

// =========================================================================
// INVENTORY ROUTES
// =========================================================================

app.get('/api/items', (req, res) => {
  const targetDate = req.query.date;
  try {
    // Only return active items to storefront
    const items = db.prepare("SELECT * FROM items WHERE is_active = 1").all();

    if (!targetDate) {
      return res.json(items.map(i => ({ ...i, available_inventory: i.max_inventory })));
    }

    // Get all active orders overlapping the 3-day window
    const activeOrders = db.prepare(`
      SELECT items_json FROM orders
      WHERE (
        event_date = ? OR
        event_date = date(?, '-1 day') OR
        event_date = date(?, '+1 day')
      )
      AND status NOT IN ('CANCELLED', 'COMPLETED')
    `).all(targetDate, targetDate, targetDate);

    // Build allocation ledger: item_id -> total quantity booked
    const ledger = {};
    activeOrders.forEach(order => {
      let lines = [];
      try { lines = JSON.parse(order.items_json); } catch(e) {}
      if (Array.isArray(lines)) {
        lines.forEach(line => {
          ledger[line.id] = (ledger[line.id] || 0) + (line.quantity || 1);
        });
      }
    });

    res.json(items.map(item => ({
      ...item,
      available_inventory: Math.max(0, item.max_inventory - (ledger[item.id] || 0))
    })));
  } catch (err) {
    console.error("Inventory error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/inventory', (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM items ORDER BY id DESC").all());
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/inventory', (req, res) => {
  const { name, type, category, theme, age_group, material, price, max_inventory, image_url } = req.body;
  if (!name || !type || !category || !theme || !price || !max_inventory) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }
  try {
    const imgUrl = (image_url && image_url.trim()) || "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=500";
    const info = db.prepare(`
      INSERT INTO items (name, type, category, theme, age_group, material, price, max_inventory, images_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(name, type, category, theme, age_group || 'Any', material || 'Mixed', Number(price), Number(max_inventory), JSON.stringify([imgUrl]));
    res.json({ success: true, itemId: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/inventory/:id', (req, res) => {
  const { price, max_inventory, is_active } = req.body;
  try {
    db.prepare("UPDATE items SET price = ?, max_inventory = ?, is_active = ? WHERE id = ?")
      .run(Number(price), Number(max_inventory), Number(is_active), req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// ORDER ROUTES
// =========================================================================

app.post('/api/orders', (req, res) => {
  const customer_phone = req.body.customer_phone || req.body.phone;
  const event_date = req.body.event_date || req.body.eventDate;
  const total_price = req.body.total_price || req.body.totalPrice || 0;
  const items = req.body.items;

  if (!customer_phone || !event_date || !items) {
    return res.status(400).json({ success: false, message: "Missing required fields: phone, event_date, items." });
  }

  // Validate event date is not today or past
  const today = new Date().toISOString().split('T')[0];
  if (event_date <= today) {
    return res.status(400).json({ success: false, message: "Event date must be a future date." });
  }

  try {
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    const info = db.prepare(`
      INSERT INTO orders (customer_phone, event_date, total_price, items_json, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `).run(customer_phone, event_date, Number(total_price), itemsJson);

    res.json({ success: true, orderId: info.lastInsertRowid });
  } catch (err) {
    console.error("Order create error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/orders', (req, res) => {
  try {
    const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
    res.json(orders.map(o => ({ ...o, items_json: safeParseJson(o.items_json) })));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/orders/customer/:phone', (req, res) => {
  try {
    const orders = db.prepare("SELECT * FROM orders WHERE customer_phone = ? ORDER BY id DESC").all(req.params.phone);
    res.json(orders.map(o => ({ ...o, items_json: safeParseJson(o.items_json) })));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/orders/details/:orderId', (req, res) => {
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    res.json({ ...order, items_json: safeParseJson(order.items_json) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// State machine transition
app.post('/api/orders/update-state', (req, res) => {
  const { orderId, items, admin_notes, total_price, status } = req.body;
  if (!orderId || !status) return res.status(400).json({ success: false, message: "orderId and status required." });

  try {
    const current = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!current) return res.status(404).json({ success: false, message: "Order not found." });

    if (current.status === 'CANCELLED' || current.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: `Order is permanently ${current.status}.` });
    }

    const finalItems = (items && items.length > 0) ? JSON.stringify(items) : current.items_json;
    const finalPrice = (total_price && total_price > 0) ? total_price : current.total_price;
    const finalNotes = admin_notes || current.admin_notes;

    db.prepare("UPDATE orders SET items_json = ?, admin_notes = ?, total_price = ?, status = ? WHERE id = ?")
      .run(finalItems, finalNotes, finalPrice, status, orderId);

    res.json({ success: true, message: `Order updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Modify order items — PENDING or REVIEWED state allowed
app.put('/api/orders/modify', (req, res) => {
  const { orderId, items, total_price } = req.body;
  if (!orderId || !Array.isArray(items)) {
    return res.status(400).json({ success: false, message: "orderId and items array required." });
  }
  try {
    const result = db.prepare(`
      UPDATE orders SET items_json = ?, total_price = ?, admin_notes = ?
      WHERE id = ? AND status IN ('PENDING', 'REVIEWED')
    `).run(JSON.stringify(items), Number(total_price), "Order audited and updated by admin.", orderId);

    if (result.changes === 0) {
      return res.status(400).json({ success: false, message: "Order must be PENDING or REVIEWED to modify." });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// HELPERS
// =========================================================================
function safeParseJson(val) {
  if (!val) return [];
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch(e) { return []; }
}

// =========================================================================
// BASE ROUTE
// =========================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => {
  console.log('🚀 Namma Party Props MVP running on http://localhost:3000');
});
