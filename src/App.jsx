import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, FileText, Coffee, Receipt, Users, BookOpen, BarChart3,
  Plus, X, Check, Send, Trash2, CircleDollarSign, AlertCircle,
  Pencil, Download, Upload, Loader2, FileUp, Settings, Landmark, LogOut,
  Building2, MapPin, ChevronDown, Menu, Mail
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

/* ---------------- design tokens ---------------- */
const T = {
  ink: "#241B12", inkSoft: "#4A3B2A", paper: "#FBF8F3", card: "#FFFFFF",
  line: "#EAE2D6", lineDark: "#D9CEBD", amber: "#C2701E", amberDark: "#9A5713",
  green: "#2F7A4D", greenBg: "#EAF3ED", red: "#B0432C", redBg: "#F7ECE8",
  muted: "#8A7B68", cream: "#F4EDE2",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

/* ---------------- helpers ---------------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n) =>
  (n < 0 ? "-$" : "$") +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const parseAmt = (s) => {
  const n = parseFloat(String(s).replace(/[$,%\s,]/g, ""));
  return isNaN(n) ? 0 : n;
};
const dstr = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const monthKey = (iso) => iso.slice(0, 7);
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCSV = (rows) => rows.map((r) => r.map(csvEsc).join(",")).join("\n");
const download = (filename, content, mime = "text/csv") => {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/* ---------------- seed data ---------------- */
const COA_COFFEE = [
  ["4000", "Sales — Drinks", "Income"], ["4100", "Sales — Food", "Income"],
  ["4200", "Sales — Merch", "Income"], ["4300", "Catering & Wholesale", "Income"],
  ["5000", "COGS — Coffee & Dairy", "Expense"], ["5100", "COGS — Cups & Packaging", "Expense"],
  ["5200", "COGS — Syrups & Sodas", "Expense"], ["6000", "Payroll & Wages", "Expense"],
  ["6100", "Rent & CAM", "Expense"], ["6200", "Utilities", "Expense"],
  ["6300", "Marketing & Promo", "Expense"], ["6400", "Software & POS Fees", "Expense"],
  ["6500", "Repairs & Maintenance", "Expense"], ["6600", "Insurance", "Expense"],
  ["6700", "Professional & Legal", "Expense"], ["6800", "Supplies — Other", "Expense"],
];
const COA_GENERAL = [
  ["4000", "Sales — Products", "Income"], ["4100", "Sales — Services", "Income"],
  ["4200", "Other Income", "Income"],
  ["5000", "Cost of Goods Sold", "Expense"], ["6000", "Payroll & Wages", "Expense"],
  ["6100", "Rent & Lease", "Expense"], ["6200", "Utilities", "Expense"],
  ["6300", "Marketing & Advertising", "Expense"], ["6400", "Software & Subscriptions", "Expense"],
  ["6500", "Repairs & Maintenance", "Expense"], ["6600", "Insurance", "Expense"],
  ["6700", "Professional & Legal", "Expense"], ["6800", "Office & Supplies", "Expense"],
  ["6900", "Travel & Meals", "Expense"],
];

const newBooks = (type) => ({
  settings: { locations: [], nextInvoiceNum: 1001, taxEstRate: 25 },
  accounts: (type === "coffee" ? COA_COFFEE : COA_GENERAL).map(([num, name, t]) => ({ id: uid(), num, name, type: t })),
  customers: [], vendors: [], invoices: [], sales: [], expenses: [],
});

const SESSION_KEY = "bb:session";
const acctKey = (email) => `bb:acct:${email.toLowerCase().replace(/[^a-z0-9@.+_-]/g, "")}`;
const booksKey = (bizId) => `bb:books:${bizId}`;
const credKey = (email) => `bb:cred:${email.toLowerCase().replace(/[^a-z0-9@.+_-]/g, "")}`;

/* ---------------- storage (localStorage, with host-storage fallback) ----------------
   The app persists everything through this async key/value store. In a hosted
   artifact environment `window.storage` is provided; on a normal web deploy it is
   not, so we fall back to localStorage so books are still saved on the device. */
const storage =
  typeof window !== "undefined" && window.storage
    ? window.storage
    : {
        get: async (k) => {
          try {
            const v = localStorage.getItem(k);
            return v === null ? null : { value: v };
          } catch {
            return null;
          }
        },
        set: async (k, v) => {
          localStorage.setItem(k, v);
        },
        delete: async (k) => {
          localStorage.removeItem(k);
        },
      };

/* ---------------- password hashing (Web Crypto, SHA-256 + per-account salt) ---------------- */
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randSalt = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return b64(a.buffer);
};
const hashPw = async (pw, salt) => {
  const data = new TextEncoder().encode(`${salt}:${pw}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return b64(digest);
};

/* ---------------- tiny UI atoms ---------------- */
const Money = ({ v, size = 14, color, weight = 600 }) => (
  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: size, fontWeight: weight, color: color || T.ink }}>
    {fmt(v)}
  </span>
);

const Btn = ({ children, onClick, kind = "primary", small, disabled }) => {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer",
    borderRadius: 8, fontWeight: 600, fontSize: small ? 12.5 : 13.5, border: "1px solid transparent",
    padding: small ? "5px 10px" : "8px 14px", opacity: disabled ? 0.5 : 1, transition: "all .15s",
  };
  const kinds = {
    primary: { background: T.amber, color: "#fff", borderColor: T.amberDark },
    ghost: { background: "transparent", color: T.inkSoft, borderColor: T.lineDark },
    danger: { background: "transparent", color: T.red, borderColor: "transparent" },
    quiet: { background: T.cream, color: T.inkSoft, borderColor: T.line },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind] }}>
      {children}
    </button>
  );
};

const Field = ({ label, children, flex }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: flex || "initial", minWidth: 0 }}>
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.muted }}>{label}</span>
    {children}
  </label>
);

const inputStyle = {
  border: `1px solid ${T.lineDark}`, borderRadius: 8, padding: "8px 10px", fontSize: 14,
  background: "#fff", color: T.ink, outline: "none", width: "100%",
};
const Input = (props) => <input {...props} style={{ ...inputStyle, ...props.style }} />;
const Select = (props) => <select {...props} style={{ ...inputStyle, ...props.style }} />;

const Badge = ({ children, tone }) => {
  const tones = {
    green: { bg: T.greenBg, fg: T.green }, red: { bg: T.redBg, fg: T.red },
    amber: { bg: "#F6E8D6", fg: T.amberDark }, gray: { bg: T.cream, fg: T.muted },
  };
  const t = tones[tone] || tones.gray;
  return (
    <span style={{ background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 99, letterSpacing: ".02em" }}>
      {children}
    </span>
  );
};

const Card = ({ children, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, ...style }}>{children}</div>
);

const Empty = ({ icon: Icon, title, body, action }) => (
  <div style={{ textAlign: "center", padding: "56px 24px", color: T.muted }}>
    <Icon size={34} style={{ margin: "0 auto 12px", opacity: 0.45 }} />
    <div style={{ fontWeight: 700, color: T.inkSoft, fontSize: 15, marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 13.5, marginBottom: 16 }}>{body}</div>
    {action}
  </div>
);

const td = { padding: "11px 18px", borderBottom: `1px solid ${T.line}` };
const thRow = (cols) => (
  <tr style={{ textAlign: "left", color: T.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>
    {cols.map(([h, right]) => (
      <th key={h || Math.random()} style={{ padding: "12px 18px", borderBottom: `1px solid ${T.line}`, textAlign: right ? "right" : "left" }}>{h}</th>
    ))}
  </tr>
);

const NeedLocation = ({ setView }) => (
  <Card>
    <Empty icon={MapPin} title="Add a location first"
      body="This business has no locations yet. Add at least one (with its address and tax info) before recording activity."
      action={<Btn onClick={() => setView("settings")}><Plus size={14} /> Add a location</Btn>} />
  </Card>
);

/* ================= APP ================= */
export default function BeanCounter() {
  const [session, setSession] = useState(undefined); // undefined loading, null signed out, {email}
  const [acct, setAcct] = useState(null);            // {businesses:[{id,name,type,ein,entity}], activeBizId}
  const [books, setBooks] = useState(null);
  const [view, setView] = useState("dashboard");
  const [loc, setLoc] = useState("All");
  const [saveState, setSaveState] = useState("idle");
  const [bizMenu, setBizMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [navOpen, setNavOpen] = useState(false);
  const booksLoaded = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ---- session ---- */
  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get(SESSION_KEY);
        setSession(r && r.value ? JSON.parse(r.value) : null);
      } catch { setSession(null); }
    })();
  }, []);

  const signIn = async (email) => {
    const s = { email: email.trim().toLowerCase() };
    try { await storage.set(SESSION_KEY, JSON.stringify(s)); } catch {}
    setSession(s);
  };
  const signOut = async () => {
    try { await storage.delete(SESSION_KEY); } catch {}
    setSession(null); setAcct(null); setBooks(null); setView("dashboard");
  };

  /* ---- account (businesses list) ---- */
  useEffect(() => {
    if (!session) return;
    (async () => {
      let a = null;
      try {
        const r = await storage.get(acctKey(session.email));
        a = r && r.value ? JSON.parse(r.value) : null;
      } catch {}
      if (!a) a = { businesses: [], activeBizId: null };
      // one-time migration of pre-account books
      if (a.businesses.length === 0) {
        try {
          const old = await storage.get("beanbooks:v1");
          if (old && old.value) {
            const od = JSON.parse(old.value);
            const bizId = uid();
            const migrated = {
              ...od,
              settings: {
                nextInvoiceNum: od.settings?.nextInvoiceNum || 1001, taxEstRate: 25,
                locations: (od.settings?.locations || []).map((n) =>
                  typeof n === "string" ? { id: uid(), name: n, address: "", city: "", phone: "", taxRate: "", manager: "" } : n),
              },
            };
            await storage.set(booksKey(bizId), JSON.stringify(migrated));
            a = { businesses: [{ id: bizId, name: od.settings?.businessName || "My Business", type: "coffee", ein: "", entity: "LLC" }], activeBizId: bizId };
          }
        } catch {}
      }
      setAcct(a);
      try { await storage.set(acctKey(session.email), JSON.stringify(a)); } catch {}
    })();
  }, [session]);

  const saveAcct = async (a) => {
    setAcct(a);
    try { await storage.set(acctKey(session.email), JSON.stringify(a)); } catch {}
  };

  /* ---- books for active business ---- */
  useEffect(() => {
    booksLoaded.current = false;
    setBooks(null);
    if (!acct || !acct.activeBizId) return;
    (async () => {
      try {
        const r = await storage.get(booksKey(acct.activeBizId));
        setBooks(r && r.value ? JSON.parse(r.value) : newBooks("general"));
      } catch { setBooks(newBooks("general")); }
      booksLoaded.current = true;
      setLoc("All");
    })();
  }, [acct?.activeBizId]);

  useEffect(() => {
    if (!booksLoaded.current || !books || !acct?.activeBizId) return;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    const key = booksKey(acct.activeBizId);
    saveTimer.current = setTimeout(async () => {
      try {
        await storage.set(key, JSON.stringify(books));
        setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1500);
      } catch { setSaveState("error"); }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [books]);

  const up = (patch) => setBooks((d) => ({ ...d, ...patch }));

  /* ---- create business ---- */
  const createBusiness = async ({ name, type, entity, ein }) => {
    const biz = { id: uid(), name: name.trim(), type, entity, ein };
    try { await storage.set(booksKey(biz.id), JSON.stringify(newBooks(type))); } catch {}
    await saveAcct({ businesses: [...(acct?.businesses || []), biz], activeBizId: biz.id });
    setView("settings");
  };
  const deleteBusiness = async (id) => {
    try { await storage.delete(booksKey(id)); } catch {}
    const rest = acct.businesses.filter((b) => b.id !== id);
    await saveAcct({ businesses: rest, activeBizId: rest[0]?.id || null });
    setView("dashboard");
  };

  /* ---- render gates ---- */
  if (session === undefined)
    return <Center>Opening the books…</Center>;
  if (session === null)
    return <SignIn onSignIn={signIn} />;
  if (!acct)
    return <Center>Loading your account…</Center>;
  if (acct.businesses.length === 0 || view === "newbiz" || !acct.activeBizId)
    return (
      <NewBusiness
        onCreate={createBusiness}
        canCancel={acct.businesses.length > 0}
        onCancel={() => setView("dashboard")}
        email={session.email}
        onSignOut={signOut}
      />
    );
  if (!books)
    return <Center>Opening {acct.businesses.find((b) => b.id === acct.activeBizId)?.name}…</Center>;

  const activeBiz = acct.businesses.find((b) => b.id === acct.activeBizId);
  const locNames = books.settings.locations.map((l) => l.name);
  const inLoc = (x) => loc === "All" || x.location === loc;

  const invoiceTotal = (inv) => inv.items.reduce((s, it) => s + it.qty * it.rate, 0);
  const isOverdue = (inv) => inv.status === "sent" && inv.dueDate && inv.dueDate < todayISO();

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "sales", label: "Sales", icon: Coffee },
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "expenses", label: "Expenses", icon: Receipt },
    { id: "import", label: "Import files", icon: Upload },
    { id: "contacts", label: "Customers & Vendors", icon: Users },
    { id: "accounts", label: "Chart of Accounts", icon: BookOpen },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "tax", label: "Tax Center", icon: Landmark },
    { id: "settings", label: "Business & Locations", icon: Settings },
  ];

  const sidebarInner = (
    <>
      <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid rgba(255,255,255,.09)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: "#F4EAD8" }}>Bean&nbsp;Counter</div>
          {isMobile && <X size={20} color="#CBBDA6" style={{ cursor: "pointer" }} onClick={() => setNavOpen(false)} />}
        </div>
        {/* business switcher */}
        <div style={{ position: "relative", marginTop: 10 }}>
          <div onClick={() => setBizMenu(!bizMenu)} style={{
            display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px", cursor: "pointer",
          }}>
            <Building2 size={14} color="#D8A560" />
            <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeBiz?.name}</span>
            <ChevronDown size={13} color="#A8987F" />
          </div>
          {bizMenu && (
            <div style={{ position: "absolute", top: "105%", left: 0, right: 0, background: "#352a1e", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, zIndex: 60, overflow: "hidden" }}>
              {acct.businesses.map((b) => (
                <div key={b.id} onClick={() => { saveAcct({ ...acct, activeBizId: b.id }); setBizMenu(false); setNavOpen(false); }}
                  style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: b.id === acct.activeBizId ? 700 : 500, cursor: "pointer", color: b.id === acct.activeBizId ? "#F2C283" : "#D8CCB6", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                  {b.name}
                </div>
              ))}
              <div onClick={() => { setBizMenu(false); setNavOpen(false); setView("newbiz"); }} style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "#D8A560", display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={13} /> Add business
              </div>
            </div>
          )}
        </div>
      </div>
      <nav style={{ padding: "12px 10px", flex: 1, overflowY: "auto" }}>
        {NAV.map((n) => {
          const active = view === n.id;
          return (
            <div key={n.id} onClick={() => { setView(n.id); setBizMenu(false); setNavOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "11px 11px" : "8px 11px", borderRadius: 8,
                cursor: "pointer", marginBottom: 2, fontSize: isMobile ? 14 : 13, fontWeight: active ? 700 : 500,
                background: active ? "rgba(194,112,30,.22)" : "transparent",
                color: active ? "#F2C283" : "#CBBDA6",
              }}>
              <n.icon size={15} /> {n.label}
            </div>
          );
        })}
      </nav>
      <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.09)" }}>
        <div style={{ fontSize: 11.5, color: "#A8987F", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.email}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "#8C7C63" }}>
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed — will retry" : "All changes saved"}
          </span>
          <span onClick={signOut} style={{ fontSize: 11, color: "#D8A560", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
            <LogOut size={12} /> Sign out
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh", background: T.paper, fontFamily: "system-ui, -apple-system, sans-serif", color: T.ink }}>
      {/* desktop sidebar */}
      {!isMobile && (
        <aside style={{ width: 230, background: T.ink, color: "#E9DFCF", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {sidebarInner}
        </aside>
      )}

      {/* mobile header + drawer */}
      {isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: T.ink, color: "#F4EAD8", padding: "13px 16px", position: "sticky", top: 0, zIndex: 40 }}>
          <Menu size={21} style={{ cursor: "pointer" }} onClick={() => setNavOpen(true)} />
          <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, flex: 1 }}>Bean Counter</div>
          <div style={{ fontSize: 11.5, color: "#CBBDA6", maxWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeBiz?.name}</div>
        </div>
      )}
      {isMobile && navOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div style={{ width: 270, maxWidth: "82%", background: T.ink, color: "#E9DFCF", display: "flex", flexDirection: "column", height: "100%" }}>
            {sidebarInner}
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,.45)" }} onClick={() => setNavOpen(false)} />
        </div>
      )}

      {/* main */}
      <main style={{ flex: 1, minWidth: 0 }} onClick={() => bizMenu && setBizMenu(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: isMobile ? "12px 16px" : "16px 26px", borderBottom: `1px solid ${T.line}`, background: "#fff" }}>
          <div style={{ fontFamily: SERIF, fontSize: isMobile ? 17 : 19, fontWeight: 700 }}>{NAV.find((n) => n.id === view)?.label}</div>
          <Field label="Location">
            <Select value={loc} onChange={(e) => setLoc(e.target.value)} style={{ width: isMobile ? 130 : 170, padding: "6px 10px" }}>
              <option>All</option>
              {locNames.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </Field>
        </div>

        <div style={{ padding: isMobile ? "16px 14px 60px" : "22px 26px 60px", maxWidth: 1100 }}>
          {view === "dashboard" && <Dashboard data={books} biz={activeBiz} invoiceTotal={invoiceTotal} isOverdue={isOverdue} inLoc={inLoc} setView={setView} isMobile={isMobile} />}
          {view === "sales" && <SalesView data={books} up={up} inLoc={inLoc} locNames={locNames} setView={setView} />}
          {view === "invoices" && <InvoicesView data={books} biz={activeBiz} up={up} inLoc={inLoc} invoiceTotal={invoiceTotal} isOverdue={isOverdue} locNames={locNames} setView={setView} />}
          {view === "expenses" && <ExpensesView data={books} up={up} inLoc={inLoc} locNames={locNames} setView={setView} />}
          {view === "import" && <ImportView data={books} up={up} setView={setView} locNames={locNames} />}
          {view === "contacts" && <ContactsView data={books} up={up} />}
          {view === "accounts" && <AccountsView data={books} up={up} />}
          {view === "reports" && <ReportsView data={books} biz={activeBiz} inLoc={inLoc} invoiceTotal={invoiceTotal} locNames={locNames} topLoc={loc} />}
          {view === "tax" && <TaxView data={books} biz={activeBiz} up={up} invoiceTotal={invoiceTotal} />}
          {view === "settings" && <SettingsView data={books} up={up} biz={activeBiz} acct={acct} saveAcct={saveAcct} deleteBusiness={deleteBusiness} />}
        </div>
      </main>
    </div>
  );
}

const Center = ({ children }) => (
  <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.paper, color: T.muted, fontFamily: "system-ui" }}>
    {children}
  </div>
);

/* ---------------- sign in ---------------- */
function SignIn({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [mode, setMode] = useState("unknown"); // unknown | login | create
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Once a valid email is entered, look up whether an account already exists
  // on this device so we can show "Sign in" vs. "Create account".
  useEffect(() => {
    let cancelled = false;
    if (!emailValid) {
      setMode("unknown");
      return;
    }
    (async () => {
      try {
        const r = await storage.get(credKey(email));
        if (!cancelled) setMode(r && r.value ? "login" : "create");
      } catch {
        if (!cancelled) setMode("create");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, emailValid]);

  const creating = mode === "create";
  const canSubmit =
    emailValid && pw.length >= 6 && (!creating || pw2.length >= 6) && !busy;

  const submit = async () => {
    setErr("");
    if (!emailValid) return setErr("Enter a valid email address.");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const r = await storage.get(credKey(email));
      const existing = r && r.value ? JSON.parse(r.value) : null;
      if (existing) {
        const h = await hashPw(pw, existing.salt);
        if (h !== existing.hash) {
          setBusy(false);
          return setErr("That password doesn't match this email.");
        }
      } else {
        if (pw !== pw2) {
          setBusy(false);
          return setErr("Passwords don't match.");
        }
        const salt = randSalt();
        const hash = await hashPw(pw, salt);
        await storage.set(credKey(email), JSON.stringify({ salt, hash }));
      }
      await onSignIn(email);
    } catch {
      setBusy(false);
      setErr("Couldn't sign in — please try again.");
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && canSubmit) submit();
  };

  const btnLabel = busy
    ? "Working…"
    : creating
    ? "Create account"
    : mode === "login"
    ? "Sign in"
    : "Continue";

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.ink, fontFamily: "system-ui" }}>
      <div style={{ width: 380, background: T.paper, borderRadius: 16, padding: "36px 34px", boxShadow: "0 24px 60px rgba(0,0,0,.4)" }}>
        <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: T.ink, textAlign: "center" }}>Bean Counter</div>
        <div style={{ fontSize: 13, color: T.muted, textAlign: "center", marginTop: 6, marginBottom: 26 }}>
          Books for every business you run.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Email">
            <Input type="email" autoComplete="email" placeholder="you@business.com" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete={creating ? "new-password" : "current-password"}
              placeholder={creating ? "At least 6 characters" : "Your password"} value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={onKey} />
          </Field>
          {creating && (
            <Field label="Confirm password">
              <Input type="password" autoComplete="new-password" placeholder="Re-enter password" value={pw2}
                onChange={(e) => setPw2(e.target.value)} onKeyDown={onKey} />
            </Field>
          )}
        </div>
        {err && (
          <div style={{ fontSize: 12.5, color: T.red, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={14} /> {err}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <button onClick={() => canSubmit && submit()} disabled={!canSubmit} style={{
            width: "100%", background: canSubmit ? T.amber : T.lineDark, color: "#fff", border: "none",
            borderRadius: 9, padding: "11px 0", fontSize: 14.5, fontWeight: 700, cursor: canSubmit ? "pointer" : "default",
          }}>{btnLabel}</button>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          {creating
            ? "New here — pick a password to create your account. It's stored only on this device."
            : mode === "login"
            ? "Welcome back. Enter your password to open your books."
            : "Enter your email and password. Your books are saved on this device."}
        </div>
      </div>
    </div>
  );
}

/* ---------------- new business ---------------- */
function NewBusiness({ onCreate, canCancel, onCancel, email, onSignOut }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("coffee");
  const [entity, setEntity] = useState("LLC");
  const [ein, setEin] = useState("");
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.ink, fontFamily: "system-ui", padding: 24 }}>
      <div style={{ width: 440, background: T.paper, borderRadius: 16, padding: "32px 32px 28px", boxShadow: "0 24px 60px rgba(0,0,0,.4)" }}>
        <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Set up a business</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 22 }}>Signed in as {email} · Each business keeps its own separate books.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Business name"><Input placeholder="e.g. MOJO's Express Coffee" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Type" flex={1}>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="coffee">Coffee / Food & Beverage</option>
                <option value="general">General business</option>
              </Select>
            </Field>
            <Field label="Entity" flex={1}>
              <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option>LLC</option><option>S-Corp</option><option>C-Corp</option>
                <option>Partnership</option><option>Sole Proprietor</option>
              </Select>
            </Field>
          </div>
          <Field label="EIN (optional — used on tax exports)"><Input placeholder="XX-XXXXXXX" value={ein} onChange={(e) => setEin(e.target.value)} /></Field>
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 14, lineHeight: 1.5 }}>
          The type sets the starting chart of accounts. After this you'll add each location and its details by hand.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          {canCancel ? <Btn kind="ghost" onClick={onCancel}>Cancel</Btn> : <Btn kind="ghost" onClick={onSignOut}><LogOut size={14} /> Sign out</Btn>}
          <Btn onClick={() => name.trim() && onCreate({ name, type, entity, ein })} disabled={!name.trim()}><Check size={15} /> Create business</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------------- dashboard ---------------- */
function Dashboard({ data, biz, invoiceTotal, isOverdue, inLoc, setView, isMobile }) {
  const [period, setPeriod] = useState("thisYear");
  const now = new Date();
  const periods = {
    thisMonth: { label: "This month", from: new Date(now.getFullYear(), now.getMonth(), 1) },
    quarter: { label: "This quarter", from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1) },
    thisYear: { label: "This year", from: new Date(now.getFullYear(), 0, 1) },
    lastYear: { label: "Last year", from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31) },
    all: { label: "All time", from: new Date(2000, 0, 1) },
  };
  const p = periods[period];
  const fromISO = isoOf(p.from);
  const toISO = isoOf(p.to || now);
  const within = (d) => d && d >= fromISO && d <= toISO;

  const revenue =
    data.sales.filter((s) => inLoc(s) && within(s.date)).reduce((s, x) => s + x.amount, 0) +
    data.invoices.filter((i) => i.status === "paid" && inLoc(i) && within(i.paidDate || i.date)).reduce((s, i) => s + invoiceTotal(i), 0);
  const expensesTotal = data.expenses.filter((e) => inLoc(e) && within(e.date)).reduce((s, e) => s + e.amount, 0);
  const net = revenue - expensesTotal;
  const unpaidInPeriod = data.invoices.filter((i) => inLoc(i) && i.status !== "draft" && within(i.date) && i.status !== "paid");
  const unpaidTotal = unpaidInPeriod.reduce((s, i) => s + invoiceTotal(i), 0);

  const series = useMemo(() => {
    const map = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = d.toISOString().slice(0, 7);
      map[k] = { m: d.toLocaleDateString("en-US", { month: "short" }), Income: 0, Expenses: 0 };
    }
    data.sales.filter(inLoc).forEach((s) => { const k = monthKey(s.date); if (map[k]) map[k].Income += s.amount; });
    data.invoices.filter((i) => i.status === "paid" && inLoc(i)).forEach((i) => { const k = monthKey(i.paidDate || i.date); if (map[k]) map[k].Income += invoiceTotal(i); });
    data.expenses.filter(inLoc).forEach((e) => { const k = monthKey(e.date); if (map[k]) map[k].Expenses += e.amount; });
    return Object.values(map);
  }, [data, inLoc]);

  const overdue = data.invoices.filter((i) => isOverdue(i) && inLoc(i));
  const recent = [
    ...data.sales.filter(inLoc).map((s) => ({ d: s.date, label: `Sales — ${s.channel}${s.location ? " · " + s.location : ""}`, amt: s.amount })),
    ...data.expenses.filter(inLoc).map((e) => ({ d: e.date, label: e.memo || "Expense", amt: -e.amount })),
    ...data.invoices.filter((i) => i.status === "paid" && inLoc(i)).map((i) => ({ d: i.paidDate || i.date, label: `Invoice #${i.num} paid`, amt: invoiceTotal(i) })),
  ].sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 8);

  const Stat = ({ label, value, color, sub }) => (
    <Card style={{ flex: 1, padding: isMobile ? "13px 14px" : "16px 18px", minWidth: isMobile ? 0 : 170 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: T.muted, marginBottom: 6 }}>{label}</div>
      <Money v={value} size={isMobile ? 19 : 24} color={color} weight={700} />
      {sub && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </Card>
  );

  const hasAnything = data.sales.length + data.expenses.length + data.invoices.length > 0;
  const noLocations = data.settings.locations.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {noLocations && (
        <Card style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderColor: T.amber }}>
          <MapPin size={18} color={T.amberDark} />
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <b>{biz?.name}</b> has no locations yet. Add each location and its details to start keeping books.
          </div>
          <Btn small onClick={() => setView("settings")}><Plus size={13} /> Add locations</Btn>
        </Card>
      )}
      {/* period selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(periods).map(([k, v]) => (
          <div key={k} onClick={() => setPeriod(k)} style={{
            padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
            background: period === k ? T.amber : "transparent", color: period === k ? "#fff" : T.muted,
            border: `1px solid ${period === k ? T.amberDark : T.lineDark}`,
          }}>{v.label}</div>
        ))}
        <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 4 }}>{dstr(fromISO)} – {dstr(toISO)}</span>
      </div>

      <div style={{ display: isMobile ? "grid" : "flex", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 10 : 14, flexWrap: "wrap" }}>
        <Stat label="Revenue" value={revenue} color={T.green} />
        <Stat label="Expenses" value={expensesTotal} color={T.red} />
        <Stat label="Net profit" value={net} color={net >= 0 ? T.ink : T.red} />
        <Stat label="Unpaid invoices" value={unpaidTotal} color={T.amberDark} sub={`${unpaidInPeriod.length} open · ${overdue.length} overdue`} />
      </div>

      {!hasAnything ? (
        <Card>
          <Empty icon={CircleDollarSign} title="Your books are empty"
            body="Start by recording a day of sales or an expense — the dashboard fills in from there."
            action={<div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <Btn onClick={() => setView("sales")}><Plus size={14} /> Record sales</Btn>
              <Btn kind="ghost" onClick={() => setView("expenses")}><Plus size={14} /> Add expense</Btn>
            </div>} />
        </Card>
      ) : (
        <>
          <Card style={{ padding: "18px 18px 8px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Income vs. expenses — last 6 months</div>
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={series} barGap={3}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 12, fill: T.muted }} axisLine={{ stroke: T.lineDark }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: T.muted, fontFamily: MONO }} tickFormatter={(v) => fmt0(v)} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Income" fill={T.green} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Expenses" fill={T.red} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Card style={{ flex: "1 1 340px", padding: 0 }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 700, fontSize: 14 }}>Recent activity</div>
              {recent.length === 0 && <div style={{ padding: 18, color: T.muted, fontSize: 13 }}>Nothing yet.</div>}
              {recent.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: i < recent.length - 1 ? `1px solid ${T.line}` : "none" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>{dstr(r.d)}</div>
                  </div>
                  <Money v={r.amt} color={r.amt >= 0 ? T.green : T.red} />
                </div>
              ))}
            </Card>
            <Card style={{ flex: "1 1 300px", padding: 0 }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={15} color={overdue.length ? T.red : T.muted} /> Overdue invoices
              </div>
              {overdue.length === 0 ? (
                <div style={{ padding: 18, color: T.muted, fontSize: 13 }}>Nothing overdue. Nice.</div>
              ) : overdue.map((inv, i) => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", borderBottom: i < overdue.length - 1 ? `1px solid ${T.line}` : "none" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>#{inv.num} · {custName(data, inv.customerId)}</div>
                    <div style={{ fontSize: 11.5, color: T.red }}>Due {dstr(inv.dueDate)}</div>
                  </div>
                  <Money v={invoiceTotal(inv)} color={T.red} />
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const custName = (data, id) => data.customers.find((c) => c.id === id)?.name || "Walk-in";
const vendName = (data, id) => data.vendors.find((v) => v.id === id)?.name || "—";
const acctName = (data, id) => data.accounts.find((a) => a.id === id)?.name || "Uncategorized";

/* ---------------- sales ---------------- */
function SalesView({ data, up, inLoc, locNames, setView }) {
  const blank = { date: todayISO(), location: locNames[0] || "", channel: "POS", amount: "", memo: "" };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const rows = [...data.sales].filter(inLoc).sort((a, b) => (a.date < b.date ? 1 : -1));

  if (locNames.length === 0) return <NeedLocation setView={setView} />;

  const save = () => {
    const amt = parseAmt(form.amount);
    if (!amt) return;
    up({ sales: [...data.sales, { ...form, amount: amt, id: uid() }] });
    setForm({ ...blank, location: form.location }); setOpen(false);
  };
  const del = (id) => up({ sales: data.sales.filter((s) => s.id !== id) });
  const exportCSV = () => {
    download("sales.csv", toCSV([["Date", "Location", "Channel", "Memo", "Amount"],
      ...rows.map((s) => [s.date, s.location, s.channel, s.memo, s.amount.toFixed(2)])]));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ color: T.muted, fontSize: 13 }}>Record daily register totals, catering jobs, and wholesale orders.</div>
        <div style={{ display: "flex", gap: 8 }}>
          {rows.length > 0 && <Btn kind="ghost" small onClick={exportCSV}><Download size={13} /> CSV</Btn>}
          <Btn onClick={() => setOpen(!open)}><Plus size={15} /> Record sales</Btn>
        </div>
      </div>

      {open && (
        <Card style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ width: 150 }} /></Field>
            <Field label="Location">
              <Select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={{ width: 150 }}>
                {locNames.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} style={{ width: 140 }}>
                <option>POS</option><option>Catering</option><option>Wholesale</option><option>Online</option><option>Other</option>
              </Select>
            </Field>
            <Field label="Amount"><Input placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: 120, fontFamily: MONO }} /></Field>
            <Field label="Memo" flex={1}><Input placeholder="e.g. Saturday register total" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field>
            <Btn onClick={save}><Check size={15} /> Save</Btn>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <Empty icon={Coffee} title="No sales recorded" body="Close out the register and log the day's total here." />
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
            <thead>{thRow([["Date"], ["Location"], ["Channel"], ["Memo"], ["Amount", 1], [""]])}</thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{dstr(s.date)}</td>
                  <td style={td}>{s.location}</td>
                  <td style={td}><Badge tone="amber">{s.channel}</Badge></td>
                  <td style={{ ...td, color: T.muted }}>{s.memo || "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}><Money v={s.amount} color={T.green} /></td>
                  <td style={{ ...td, width: 40 }}><Btn kind="danger" small onClick={() => del(s.id)}><Trash2 size={14} /></Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- invoices ---------------- */
const invoiceHTML = (data, biz, inv, total) => {
  const locInfo = data.settings.locations.find((l) => l.name === inv.location);
  const cust = data.customers.find((c) => c.id === inv.customerId);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${inv.num}</title>
<style>body{font-family:Georgia,serif;color:#241B12;max-width:680px;margin:48px auto;padding:0 24px}
.h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px double #241B12;padding-bottom:18px}
h1{font-size:30px;margin:0}.muted{color:#8A7B68;font-size:13px;font-family:system-ui}
table{width:100%;border-collapse:collapse;margin-top:28px;font-family:system-ui;font-size:14px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8A7B68;border-bottom:1px solid #241B12;padding:8px 4px}
td{padding:10px 4px;border-bottom:1px solid #EAE2D6}.r{text-align:right}
.total{font-size:20px;font-weight:bold;border-top:3px double #241B12;margin-top:8px;padding-top:12px;display:flex;justify-content:space-between;font-family:system-ui}
</style></head><body>
<div class="h"><div><h1>${biz?.name || ""}</h1>
<div class="muted">${locInfo ? [locInfo.address, locInfo.city, locInfo.phone].filter(Boolean).join(" · ") : (inv.location || "")}</div>
${biz?.ein ? `<div class="muted">EIN ${biz.ein}</div>` : ""}</div>
<div style="text-align:right"><div style="font-size:22px;font-weight:bold">INVOICE</div>
<div class="muted">#${inv.num}<br>Date: ${dstr(inv.date)}<br>Due: ${dstr(inv.dueDate)}</div></div></div>
<div style="margin-top:22px;font-family:system-ui;font-size:14px"><b>Bill to:</b> ${cust?.name || "—"}${cust?.email ? ` · ${cust.email}` : ""}</div>
<table><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
${inv.items.map((it) => `<tr><td>${it.desc || ""}</td><td class="r">${it.qty}</td><td class="r">${fmt(it.rate)}</td><td class="r">${fmt(it.qty * it.rate)}</td></tr>`).join("")}
</table>
<div class="total"><span>Total due</span><span>${fmt(total)}</span></div>
<p class="muted" style="margin-top:36px">Thank you for your business.</p>
</body></html>`;
};

function InvoicesView({ data, biz, up, inLoc, invoiceTotal, isOverdue, locNames, setView }) {
  const [editing, setEditing] = useState(null);
  const rows = [...data.invoices].filter(inLoc).sort((a, b) => b.num - a.num);

  if (locNames.length === 0) return <NeedLocation setView={setView} />;

  const newInvoice = () => setEditing({
    id: uid(), num: data.settings.nextInvoiceNum, customerId: "", date: todayISO(),
    dueDate: "", items: [{ desc: "", qty: 1, rate: "" }], status: "draft", location: locNames[0] || "",
  });

  const saveInvoice = (inv) => {
    const clean = { ...inv, items: inv.items.map((it) => ({ desc: it.desc, qty: parseAmt(it.qty) || 1, rate: parseAmt(it.rate) })) };
    const exists = data.invoices.some((i) => i.id === inv.id);
    up({
      invoices: exists ? data.invoices.map((i) => (i.id === inv.id ? clean : i)) : [...data.invoices, clean],
      settings: exists ? data.settings : { ...data.settings, nextInvoiceNum: data.settings.nextInvoiceNum + 1 },
    });
    setEditing(null);
  };

  const setStatus = (id, status) =>
    up({ invoices: data.invoices.map((i) => (i.id === id ? { ...i, status, paidDate: status === "paid" ? todayISO() : i.paidDate } : i)) });
  const del = (id) => up({ invoices: data.invoices.filter((i) => i.id !== id) });

  const exportList = () =>
    download("invoices.csv", toCSV([
      ["Invoice #", "Customer", "Date", "Due date", "Status", "Paid date", "Location", "Total"],
      ...rows.map((i) => [i.num, custName(data, i.customerId), i.date, i.dueDate, isOverdue(i) ? "overdue" : i.status, i.paidDate || "", i.location, invoiceTotal(i).toFixed(2)]),
    ]));
  const downloadInvoice = (inv) =>
    download(`invoice-${inv.num}.html`, invoiceHTML(data, biz, inv, invoiceTotal(inv)), "text/html");

  if (editing) return <InvoiceForm data={data} inv={editing} setInv={setEditing} onSave={saveInvoice} onCancel={() => setEditing(null)} locNames={locNames} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ color: T.muted, fontSize: 13 }}>For catering jobs, wholesale accounts, and anything billed later.</div>
        <div style={{ display: "flex", gap: 8 }}>
          {rows.length > 0 && <Btn kind="ghost" small onClick={exportList}><Download size={13} /> Export list (CSV)</Btn>}
          <Btn onClick={newInvoice}><Plus size={15} /> New invoice</Btn>
        </div>
      </div>
      <Card style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <Empty icon={FileText} title="No invoices yet" body="Create one for your first catering or wholesale customer."
            action={<Btn onClick={newInvoice}><Plus size={14} /> New invoice</Btn>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
            <thead>{thRow([["#"], ["Customer"], ["Date"], ["Due"], ["Status"], ["Total", 1], [""]])}</thead>
            <tbody>
              {rows.map((inv) => {
                const od = isOverdue(inv);
                return (
                  <tr key={inv.id}>
                    <td style={{ ...td, fontFamily: MONO }}>{inv.num}</td>
                    <td style={td}>{custName(data, inv.customerId)}</td>
                    <td style={td}>{dstr(inv.date)}</td>
                    <td style={{ ...td, color: od ? T.red : T.ink }}>{dstr(inv.dueDate)}</td>
                    <td style={td}>
                      {od ? <Badge tone="red">Overdue</Badge> :
                        inv.status === "paid" ? <Badge tone="green">Paid</Badge> :
                        inv.status === "sent" ? <Badge tone="amber">Sent</Badge> : <Badge>Draft</Badge>}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}><Money v={invoiceTotal(inv)} /></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {inv.status === "draft" && <Btn kind="quiet" small onClick={() => setStatus(inv.id, "sent")}><Send size={13} /> Sent</Btn>}
                      {inv.status === "sent" && <Btn kind="quiet" small onClick={() => setStatus(inv.id, "paid")}><Check size={13} /> Paid</Btn>}
                      {" "}
                      <Btn kind="ghost" small onClick={() => downloadInvoice(inv)}><Download size={13} /></Btn>
                      <Btn kind="ghost" small onClick={() => setEditing(JSON.parse(JSON.stringify(inv)))}><Pencil size={13} /></Btn>
                      <Btn kind="danger" small onClick={() => del(inv.id)}><Trash2 size={14} /></Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>
      <div style={{ fontSize: 12, color: T.muted }}>The download button on each row saves a print-ready invoice (open it and print to PDF to send).</div>
    </div>
  );
}

function InvoiceForm({ data, inv, setInv, onSave, onCancel, locNames }) {
  const total = inv.items.reduce((s, it) => s + (parseAmt(it.qty) || 1) * parseAmt(it.rate), 0);
  const setItem = (idx, patch) => setInv({ ...inv, items: inv.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  return (
    <Card style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700 }}>Invoice #{inv.num}</div>
        <Btn kind="ghost" small onClick={onCancel}><X size={14} /> Close</Btn>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Field label="Customer" flex={1}>
          <Select value={inv.customerId} onChange={(e) => setInv({ ...inv, customerId: e.target.value })}>
            <option value="">Select customer…</option>
            {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Location">
          <Select value={inv.location} onChange={(e) => setInv({ ...inv, location: e.target.value })} style={{ width: 150 }}>
            {locNames.map((l) => <option key={l}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Invoice date"><Input type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} style={{ width: 150 }} /></Field>
        <Field label="Due date"><Input type="date" value={inv.dueDate} onChange={(e) => setInv({ ...inv, dueDate: e.target.value })} style={{ width: 150 }} /></Field>
      </div>
      {data.customers.length === 0 && (
        <div style={{ fontSize: 12.5, color: T.amberDark, marginBottom: 14 }}>
          No customers yet — add one under Customers &amp; Vendors, then come back.
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: T.muted, marginBottom: 8 }}>Line items</div>
      {inv.items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
          <Input placeholder="Description (e.g. 3-gal coffee box, 24 pastries)" value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} style={{ flex: 1 }} />
          <Input placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} style={{ width: 70, fontFamily: MONO }} />
          <Input placeholder="Rate" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} style={{ width: 100, fontFamily: MONO }} />
          <div style={{ width: 100, textAlign: "right" }}><Money v={(parseAmt(it.qty) || 1) * parseAmt(it.rate)} /></div>
          <Btn kind="danger" small onClick={() => setInv({ ...inv, items: inv.items.filter((_, j) => j !== i) })} disabled={inv.items.length === 1}><Trash2 size={14} /></Btn>
        </div>
      ))}
      <Btn kind="quiet" small onClick={() => setInv({ ...inv, items: [...inv.items, { desc: "", qty: 1, rate: "" }] })}><Plus size={13} /> Add line</Btn>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 16, borderTop: `2px solid ${T.ink}` }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Total &nbsp;<Money v={total} size={20} weight={700} /></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={() => onSave(inv)} disabled={!inv.customerId || total <= 0}><Check size={15} /> Save invoice</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- expenses ---------------- */
function ExpensesView({ data, up, inLoc, locNames, setView }) {
  const expAccts = data.accounts.filter((a) => a.type === "Expense");
  const blank = {
    date: todayISO(), vendorId: "", accountId: expAccts[0]?.id || "", amount: "",
    memo: "", method: "Card", location: locNames[0] || "",
  };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const rows = [...data.expenses].filter(inLoc).sort((a, b) => (a.date < b.date ? 1 : -1));

  if (locNames.length === 0) return <NeedLocation setView={setView} />;

  const save = () => {
    const amt = parseAmt(form.amount);
    if (!amt) return;
    up({ expenses: [...data.expenses, { ...form, amount: amt, id: uid() }] });
    setForm({ ...blank, location: form.location }); setOpen(false);
  };
  const del = (id) => up({ expenses: data.expenses.filter((e) => e.id !== id) });
  const exportCSV = () =>
    download("expenses.csv", toCSV([["Date", "Vendor", "Category", "Memo", "Method", "Location", "Amount"],
      ...rows.map((e) => [e.date, vendName(data, e.vendorId), acctName(data, e.accountId), e.memo, e.method, e.location, e.amount.toFixed(2)])]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ color: T.muted, fontSize: 13 }}>Every bean, cup, and kilowatt — categorized so reports stay honest.</div>
        <div style={{ display: "flex", gap: 8 }}>
          {rows.length > 0 && <Btn kind="ghost" small onClick={exportCSV}><Download size={13} /> CSV</Btn>}
          <Btn onClick={() => setOpen(!open)}><Plus size={15} /> Add expense</Btn>
        </div>
      </div>

      {open && (
        <Card style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ width: 150 }} /></Field>
            <Field label="Vendor">
              <Select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} style={{ width: 170 }}>
                <option value="">No vendor</option>
                {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} style={{ width: 210 }}>
                {expAccts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount"><Input placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: 110, fontFamily: MONO }} /></Field>
            <Field label="Paid via">
              <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} style={{ width: 120 }}>
                <option>Card</option><option>Cash</option><option>Check</option><option>ACH</option><option>Other</option>
              </Select>
            </Field>
            <Field label="Location">
              <Select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={{ width: 140 }}>
                {locNames.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Memo" flex={1}><Input placeholder="What was it for?" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field>
            <Btn onClick={save}><Check size={15} /> Save</Btn>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <Empty icon={Receipt} title="No expenses recorded" body="Log your first purchase — beans, cups, rent, anything." />
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
            <thead>{thRow([["Date"], ["Vendor"], ["Category"], ["Memo"], ["Via"], ["Amount", 1], [""]])}</thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td style={td}>{dstr(e.date)}</td>
                  <td style={td}>{vendName(data, e.vendorId)}</td>
                  <td style={td}>{acctName(data, e.accountId)}</td>
                  <td style={{ ...td, color: T.muted }}>{e.memo || "—"}</td>
                  <td style={td}>{e.method}</td>
                  <td style={{ ...td, textAlign: "right" }}><Money v={-e.amount} color={T.red} /></td>
                  <td style={{ ...td, width: 40 }}><Btn kind="danger" small onClick={() => del(e.id)}><Trash2 size={14} /></Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- contacts ---------------- */
function ContactsView({ data, up }) {
  const [tab, setTab] = useState("customers");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const isCust = tab === "customers";
  const list = isCust ? data.customers : data.vendors;

  const add = () => {
    if (!name.trim()) return;
    const rec = { id: uid(), name: name.trim(), [isCust ? "email" : "category"]: detail.trim() };
    up(isCust ? { customers: [...data.customers, rec] } : { vendors: [...data.vendors, rec] });
    setName(""); setDetail("");
  };
  const del = (id) =>
    up(isCust ? { customers: data.customers.filter((c) => c.id !== id) } : { vendors: data.vendors.filter((v) => v.id !== id) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {["customers", "vendors"].map((t) => (
          <div key={t} onClick={() => setTab(t)} style={{
            padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, fontWeight: 700,
            background: tab === t ? T.ink : "transparent", color: tab === t ? "#F2E8D6" : T.muted,
            border: `1px solid ${tab === t ? T.ink : T.lineDark}`, textTransform: "capitalize",
          }}>{t}</div>
        ))}
      </div>
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label={isCust ? "Customer name" : "Vendor name"} flex={1}>
            <Input placeholder={isCust ? "e.g. Norco Little League" : "e.g. Coastal Roasters"} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={isCust ? "Email (optional)" : "What they supply (optional)"} flex={1}>
            <Input placeholder={isCust ? "billing@…" : "Beans, dairy, packaging…"} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </Field>
          <Btn onClick={add}><Plus size={15} /> Add</Btn>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        {list.length === 0 ? (
          <Empty icon={Users} title={isCust ? "No customers yet" : "No vendors yet"}
            body={isCust ? "Customers show up on invoices." : "Vendors make expense tracking faster."} />
        ) : list.map((c, i) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: i < list.length - 1 ? `1px solid ${T.line}` : "none" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{c.email || c.category || ""}</div>
            </div>
            <Btn kind="danger" small onClick={() => del(c.id)}><Trash2 size={14} /></Btn>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ---------------- chart of accounts ---------------- */
function AccountsView({ data, up }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Expense");
  const groups = ["Income", "Expense"];

  const add = () => {
    if (!name.trim()) return;
    const nums = data.accounts.filter((a) => a.type === type).map((a) => parseInt(a.num)).filter(Boolean);
    const next = nums.length ? Math.max(...nums) + 10 : type === "Income" ? 4000 : 6000;
    up({ accounts: [...data.accounts, { id: uid(), num: String(next), name: name.trim(), type }] });
    setName("");
  };
  const del = (id) => up({ accounts: data.accounts.filter((a) => a.id !== id) });
  const usage = (id) => data.expenses.filter((e) => e.accountId === id).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Account name" flex={1}><Input placeholder="e.g. Equipment Leases" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }}>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </Select>
          </Field>
          <Btn onClick={add}><Plus size={15} /> Add account</Btn>
        </div>
      </Card>
      {groups.map((g) => (
        <Card key={g} style={{ padding: 0 }}>
          <div style={{ padding: "13px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 700, fontSize: 14 }}>{g} accounts</div>
          {data.accounts.filter((a) => a.type === g).map((a, i, arr) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", padding: "10px 18px", borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : "none", gap: 14 }}>
              <span style={{ fontFamily: MONO, fontSize: 12.5, color: T.muted, width: 44 }}>{a.num}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{a.name}</span>
              {g === "Expense" && usage(a.id) > 0 && <span style={{ fontSize: 11.5, color: T.muted }}>{usage(a.id)} transactions</span>}
              <Btn kind="danger" small onClick={() => del(a.id)} disabled={usage(a.id) > 0}><Trash2 size={14} /></Btn>
            </div>
          ))}
        </Card>
      ))}
      <div style={{ fontSize: 12, color: T.muted }}>Accounts with transactions can't be deleted — recategorize or delete those expenses first.</div>
    </div>
  );
}

/* ---------------- reports ---------------- */
function ReportsView({ data, biz, inLoc, invoiceTotal, locNames, topLoc }) {
  const [tab, setTab] = useState("pl");
  const [range, setRange] = useState("thisMonth");
  const [customFrom, setCustomFrom] = useState(isoOf(new Date(new Date().getFullYear(), 0, 1)));
  const [customTo, setCustomTo] = useState(todayISO());
  const [channel, setChannel] = useState("All");
  const [catFilter, setCatFilter] = useState("All");
  const [asOf, setAsOf] = useState(todayISO());

  const now = new Date();
  const ranges = {
    thisMonth: { label: "This month", from: new Date(now.getFullYear(), now.getMonth(), 1) },
    lastMonth: { label: "Last month", from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) },
    quarter: { label: "This quarter", from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1) },
    lastQuarter: {
      label: "Last quarter",
      from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1),
      to: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0),
    },
    ytd: { label: "Year to date", from: new Date(now.getFullYear(), 0, 1) },
    lastYear: { label: "Last year", from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31) },
    all: { label: "All time", from: new Date(2000, 0, 1) },
    custom: { label: "Custom" },
  };
  const r = ranges[range];
  const fromISO = range === "custom" ? customFrom : isoOf(r.from);
  const toISO = range === "custom" ? customTo : isoOf(r.to || now);
  const within = (d) => d >= fromISO && d <= toISO;

  const expAccts = data.accounts.filter((a) => a.type === "Expense");

  const sales = data.sales.filter((s) => inLoc(s) && within(s.date) && (channel === "All" || s.channel === channel));
  const paidInv = data.invoices.filter((i) => i.status === "paid" && inLoc(i) && within(i.paidDate || i.date));
  const exps = data.expenses.filter((e) => inLoc(e) && within(e.date) && (catFilter === "All" || e.accountId === catFilter));

  const incomeLines = [];
  const byChannel = {};
  sales.forEach((s) => { byChannel[s.channel] = (byChannel[s.channel] || 0) + s.amount; });
  Object.entries(byChannel).forEach(([k, v]) => incomeLines.push({ name: `Sales — ${k}`, amt: v }));
  const invSum = (channel === "All" ? paidInv : []).reduce((s, i) => s + invoiceTotal(i), 0);
  if (invSum > 0) incomeLines.push({ name: "Invoiced sales (paid)", amt: invSum });
  const totalIncome = incomeLines.reduce((s, l) => s + l.amt, 0);

  const byAcct = {};
  exps.forEach((e) => { byAcct[e.accountId] = (byAcct[e.accountId] || 0) + e.amount; });
  const expenseLines = Object.entries(byAcct).map(([id, amt]) => ({ name: acctName(data, id), amt })).sort((a, b) => b.amt - a.amt);
  const totalExp = expenseLines.reduce((s, l) => s + l.amt, 0);
  const net = totalIncome - totalExp;
  const maxExp = Math.max(...expenseLines.map((l) => l.amt), 1);

  /* ---- balance sheet (cash basis, as of date) ---- */
  const bsLoc = (x) => inLoc(x);
  const cash =
    data.sales.filter((s) => bsLoc(s) && s.date <= asOf).reduce((s, x) => s + x.amount, 0) +
    data.invoices.filter((i) => bsLoc(i) && i.status === "paid" && (i.paidDate || i.date) <= asOf).reduce((s, i) => s + invoiceTotal(i), 0) -
    data.expenses.filter((e) => bsLoc(e) && e.date <= asOf).reduce((s, e) => s + e.amount, 0);
  const ar = data.invoices.filter((i) =>
    bsLoc(i) && i.status !== "draft" && i.date <= asOf && !(i.status === "paid" && (i.paidDate || i.date) <= asOf)
  ).reduce((s, i) => s + invoiceTotal(i), 0);
  const taxPayable = data.settings.locations.reduce((sum, l) => {
    const rate = parseAmt(l.taxRate);
    if (!rate || (topLoc !== "All" && topLoc !== l.name)) return sum;
    const locSales = data.sales.filter((s) => s.location === l.name && s.date <= asOf).reduce((s, x) => s + x.amount, 0);
    return sum + (locSales - locSales / (1 + rate / 100));
  }, 0);
  const totalAssets = cash + ar;
  const totalLiab = taxPayable;
  const equity = totalAssets - totalLiab;

  /* ---- exports ---- */
  const scope = `${biz?.name || ""} · ${topLoc === "All" ? "All locations" : topLoc}`;
  const exportPL = () =>
    download(`profit-and-loss_${fromISO}_${toISO}.csv`, toCSV([
      ["Profit & Loss", scope], ["Period", `${fromISO} to ${toISO}`], [],
      ["INCOME"], ...incomeLines.map((l) => [l.name, l.amt.toFixed(2)]), ["Total income", totalIncome.toFixed(2)], [],
      ["EXPENSES"], ...expenseLines.map((l) => [l.name, l.amt.toFixed(2)]), ["Total expenses", totalExp.toFixed(2)], [],
      ["NET PROFIT", net.toFixed(2)],
    ]));
  const exportBS = () =>
    download(`balance-sheet_${asOf}.csv`, toCSV([
      ["Balance Sheet (cash basis)", scope], ["As of", asOf], [],
      ["ASSETS"], ["Cash (from books)", cash.toFixed(2)], ["Accounts receivable", ar.toFixed(2)], ["Total assets", totalAssets.toFixed(2)], [],
      ["LIABILITIES"], ["Estimated sales tax payable", taxPayable.toFixed(2)], ["Total liabilities", totalLiab.toFixed(2)], [],
      ["EQUITY"], ["Retained earnings", equity.toFixed(2)], ["Total liabilities & equity", (totalLiab + equity).toFixed(2)],
    ]));
  const exportTxns = () =>
    download(`transactions_${fromISO}_${toISO}.csv`, toCSV([
      ["Date", "Type", "Description", "Category/Channel", "Location", "Amount"],
      ...sales.map((s) => [s.date, "Sale", s.memo, s.channel, s.location, s.amount.toFixed(2)]),
      ...paidInv.map((i) => [i.paidDate || i.date, "Invoice payment", `#${i.num} ${custName(data, i.customerId)}`, "Invoiced", i.location, invoiceTotal(i).toFixed(2)]),
      ...exps.map((e) => [e.date, "Expense", `${vendName(data, e.vendorId)} — ${e.memo}`, acctName(data, e.accountId), e.location, (-e.amount).toFixed(2)]),
    ]));

  const Row = ({ name, amt, neg, bold, indent }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "8px 0",
      paddingLeft: indent ? 18 : 0, borderBottom: `1px solid ${bold ? T.ink : T.line}`,
      fontWeight: bold ? 700 : 500, fontSize: bold ? 14.5 : 13.5,
    }}>
      <span>{name}</span>
      <Money v={neg ? -amt : amt} weight={bold ? 700 : 600} color={bold ? (neg ? T.red : T.ink) : undefined} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* report tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {[["pl", "Profit & Loss"], ["bs", "Balance Sheet"]].map(([k, lbl]) => (
          <div key={k} onClick={() => setTab(k)} style={{
            padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, fontWeight: 700,
            background: tab === k ? T.ink : "transparent", color: tab === k ? "#F2E8D6" : T.muted,
            border: `1px solid ${tab === k ? T.ink : T.lineDark}`,
          }}>{lbl}</div>
        ))}
      </div>

      {tab === "pl" && (
        <>
          {/* filters */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {Object.entries(ranges).map(([k, v]) => (
                <div key={k} onClick={() => setRange(k)} style={{
                  padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                  background: range === k ? T.amber : "transparent", color: range === k ? "#fff" : T.muted,
                  border: `1px solid ${range === k ? T.amberDark : T.lineDark}`,
                }}>{v.label}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {range === "custom" && (
                <>
                  <Field label="From"><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 150 }} /></Field>
                  <Field label="To"><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 150 }} /></Field>
                </>
              )}
              <Field label="Sales channel">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ width: 150 }}>
                  <option>All</option><option>POS</option><option>Catering</option><option>Wholesale</option><option>Online</option><option>Other</option>
                </Select>
              </Field>
              <Field label="Expense category">
                <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ width: 210 }}>
                  <option value="All">All categories</option>
                  {expAccts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <div style={{ flex: 1 }} />
              <Btn kind="ghost" small onClick={exportTxns}><Download size={13} /> Transactions CSV</Btn>
              <Btn small onClick={exportPL}><Download size={13} /> Export P&amp;L</Btn>
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10 }}>
              Location filter comes from the selector in the top bar ({topLoc === "All" ? "all locations" : topLoc}).
              {channel !== "All" && " Invoiced sales are hidden while a channel filter is on."}
            </div>
          </Card>

          <Card style={{ padding: 26, maxWidth: 660 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700 }}>Profit &amp; Loss</div>
              <div style={{ fontSize: 12.5, color: T.muted }}>{scope} · {dstr(fromISO)} – {dstr(toISO)}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.green, marginBottom: 4 }}>Income</div>
            {incomeLines.length === 0 && <div style={{ fontSize: 13, color: T.muted, padding: "6px 0" }}>No income in this period.</div>}
            {incomeLines.map((l) => <Row key={l.name} name={l.name} amt={l.amt} indent />)}
            <Row name="Total income" amt={totalIncome} bold />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.red, margin: "18px 0 4px" }}>Expenses</div>
            {expenseLines.length === 0 && <div style={{ fontSize: 13, color: T.muted, padding: "6px 0" }}>No expenses in this period.</div>}
            {expenseLines.map((l) => <Row key={l.name} name={l.name} amt={l.amt} neg indent />)}
            <Row name="Total expenses" amt={totalExp} neg bold />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 12, borderTop: `3px double ${T.ink}` }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>Net profit</span>
              <Money v={net} size={18} weight={800} color={net >= 0 ? T.green : T.red} />
            </div>
            {totalIncome > 0 && (
              <div style={{ textAlign: "right", fontSize: 12, color: T.muted, marginTop: 4 }}>{((net / totalIncome) * 100).toFixed(1)}% net margin</div>
            )}
          </Card>

          {expenseLines.length > 0 && (
            <Card style={{ padding: 22, maxWidth: 660 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Where the money went</div>
              {expenseLines.map((l) => (
                <div key={l.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600 }}>{l.name}</span>
                    <span style={{ fontFamily: MONO, color: T.muted }}>{fmt(l.amt)} · {((l.amt / totalExp) * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 7, background: T.cream, borderRadius: 99 }}>
                    <div style={{ height: 7, width: `${(l.amt / maxExp) * 100}%`, background: T.amber, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === "bs" && (
        <>
          <Card style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="As of date"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 160 }} /></Field>
            <div style={{ flex: 1 }} />
            <Btn small onClick={exportBS}><Download size={13} /> Export balance sheet</Btn>
          </Card>
          <Card style={{ padding: 26, maxWidth: 660 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700 }}>Balance Sheet</div>
              <div style={{ fontSize: 12.5, color: T.muted }}>{scope} · As of {dstr(asOf)} · Cash basis</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.green, marginBottom: 4 }}>Assets</div>
            <Row name="Cash (income received − expenses paid)" amt={cash} indent />
            <Row name="Accounts receivable" amt={ar} indent />
            <Row name="Total assets" amt={totalAssets} bold />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.red, margin: "18px 0 4px" }}>Liabilities</div>
            <Row name="Estimated sales tax payable" amt={taxPayable} indent />
            <Row name="Total liabilities" amt={totalLiab} bold />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.amberDark, margin: "18px 0 4px" }}>Equity</div>
            <Row name="Retained earnings" amt={equity} indent />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 12, borderTop: `3px double ${T.ink}` }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>Liabilities + equity</span>
              <Money v={totalLiab + equity} size={18} weight={800} />
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 14, lineHeight: 1.5 }}>
              Built from what's in the books: cash assumes all recorded income was collected and expenses paid; sales tax payable is
              estimated from each location's tax rate (set under Business &amp; Locations) assuming register totals include tax.
              Loans, equipment, and opening balances aren't tracked here.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------------- tax center ---------------- */
function TaxView({ data, biz, up, invoiceTotal }) {
  const allDates = [
    ...data.sales.map((s) => s.date),
    ...data.expenses.map((e) => e.date),
    ...data.invoices.filter((i) => i.status === "paid").map((i) => i.paidDate || i.date),
  ];
  const years = [...new Set([new Date().getFullYear(), ...allDates.map((d) => parseInt(d.slice(0, 4)))])].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  const inYear = (d) => d && d.startsWith(String(year));
  const qOf = (d) => Math.floor((parseInt(d.slice(5, 7)) - 1) / 3); // 0..3

  const sales = data.sales.filter((s) => inYear(s.date));
  const paidInv = data.invoices.filter((i) => i.status === "paid" && inYear(i.paidDate || i.date));
  const exps = data.expenses.filter((e) => inYear(e.date));

  const grossReceipts = sales.reduce((s, x) => s + x.amount, 0) + paidInv.reduce((s, i) => s + invoiceTotal(i), 0);
  const byAcct = {};
  exps.forEach((e) => { byAcct[e.accountId] = (byAcct[e.accountId] || 0) + e.amount; });
  const expenseLines = Object.entries(byAcct).map(([id, amt]) => {
    const a = data.accounts.find((x) => x.id === id);
    return { num: a?.num || "", name: a?.name || "Uncategorized", amt, isCOGS: (a?.name || "").toUpperCase().includes("COGS") || (a?.name || "").includes("Cost of Goods") };
  }).sort((a, b) => (a.num < b.num ? -1 : 1));
  const cogs = expenseLines.filter((l) => l.isCOGS).reduce((s, l) => s + l.amt, 0);
  const opex = expenseLines.filter((l) => !l.isCOGS).reduce((s, l) => s + l.amt, 0);
  const netProfit = grossReceipts - cogs - opex;

  // quarterly
  const quarters = [0, 1, 2, 3].map((q) => {
    const inc = sales.filter((s) => qOf(s.date) === q).reduce((s, x) => s + x.amount, 0) +
      paidInv.filter((i) => qOf(i.paidDate || i.date) === q).reduce((s, i) => s + invoiceTotal(i), 0);
    const exp = exps.filter((e) => qOf(e.date) === q).reduce((s, e) => s + e.amount, 0);
    return { q: `Q${q + 1}`, income: inc, expenses: exp, net: inc - exp };
  });
  const estRate = data.settings.taxEstRate ?? 25;

  // sales tax by location & quarter (assumes register totals include tax)
  const taxLocs = data.settings.locations.filter((l) => parseAmt(l.taxRate) > 0);
  const salesTaxRows = taxLocs.map((l) => {
    const rate = parseAmt(l.taxRate);
    const perQ = [0, 1, 2, 3].map((q) => {
      const gross = sales.filter((s) => s.location === l.name && qOf(s.date) === q).reduce((s, x) => s + x.amount, 0);
      return gross - gross / (1 + rate / 100);
    });
    return { name: l.name, rate, perQ, total: perQ.reduce((a, b) => a + b, 0) };
  });

  // 1099 candidates: vendors paid >= $600 via Cash/Check/ACH
  const vendorPaid = {};
  exps.filter((e) => ["Cash", "Check", "ACH", "Other"].includes(e.method) && e.vendorId).forEach((e) => {
    vendorPaid[e.vendorId] = (vendorPaid[e.vendorId] || 0) + e.amount;
  });
  const v1099 = Object.entries(vendorPaid).filter(([, amt]) => amt >= 600)
    .map(([id, amt]) => ({ name: vendName(data, id), amt })).sort((a, b) => b.amt - a.amt);

  const exportTaxPackage = () =>
    download(`tax-package_${year}_${(biz?.name || "business").replace(/\s+/g, "-")}.csv`, toCSV([
      [`Tax package — ${year}`, biz?.name || ""], ["Entity", biz?.entity || ""], ["EIN", biz?.ein || ""], [],
      ["INCOME"], ["Gross receipts (cash basis)", grossReceipts.toFixed(2)], [],
      ["COST OF GOODS SOLD"], ...expenseLines.filter((l) => l.isCOGS).map((l) => [l.name, l.amt.toFixed(2)]), ["Total COGS", cogs.toFixed(2)], [],
      ["OPERATING EXPENSES BY CATEGORY"], ...expenseLines.filter((l) => !l.isCOGS).map((l) => [l.name, l.amt.toFixed(2)]), ["Total operating expenses", opex.toFixed(2)], [],
      ["NET PROFIT", netProfit.toFixed(2)], [],
      ["QUARTERLY NET PROFIT"], ...quarters.map((q) => [q.q, q.net.toFixed(2)]), [],
      ["ESTIMATED SALES TAX COLLECTED (register totals assumed tax-inclusive)"],
      ...salesTaxRows.map((r) => [`${r.name} (${r.rate}%)`, r.total.toFixed(2)]), [],
      ["VENDORS PAID ≥ $600 BY CASH/CHECK/ACH (possible 1099s)"], ...v1099.map((v) => [v.name, v.amt.toFixed(2)]),
    ]));

  const Th = ({ children, right }) => (
    <th style={{ padding: "10px 16px", borderBottom: `1px solid ${T.line}`, textAlign: right ? "right" : "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: T.muted }}>{children}</th>
  );
  const Td = ({ children, right, mono }) => (
    <td style={{ padding: "10px 16px", borderBottom: `1px solid ${T.line}`, textAlign: right ? "right" : "left", fontSize: 13.5, fontFamily: mono ? MONO : undefined }}>{children}</td>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <Field label="Tax year">
          <Select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: 130 }}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </Select>
        </Field>
        <Btn onClick={exportTaxPackage}><Download size={14} /> Export tax package (CSV)</Btn>
      </div>

      {/* year summary */}
      <Card style={{ padding: 22, maxWidth: 660 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{year} year summary — cash basis</div>
        {[
          ["Gross receipts", grossReceipts],
          ["Cost of goods sold", -cogs],
          ["Operating expenses", -opex],
        ].map(([n, v]) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
            <span>{n}</span><Money v={v} color={v < 0 ? T.red : T.green} />
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: `3px double ${T.ink}` }}>
          <span style={{ fontWeight: 800 }}>Net profit</span>
          <Money v={netProfit} size={17} weight={800} color={netProfit >= 0 ? T.green : T.red} />
        </div>
      </Card>

      {/* quarterly + estimates */}
      <Card style={{ padding: 0, maxWidth: 660 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Quarterly profit &amp; estimated set-aside</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.muted }}>
            Set-aside rate
            <Input value={estRate} onChange={(e) => up({ settings: { ...data.settings, taxEstRate: parseAmt(e.target.value) } })}
              style={{ width: 64, padding: "4px 8px", fontFamily: MONO, textAlign: "right" }} />%
          </label>
        </div>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead><tr><Th>Quarter</Th><Th right>Income</Th><Th right>Expenses</Th><Th right>Net</Th><Th right>Set-aside @ {estRate}%</Th></tr></thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.q}>
                <Td>{q.q}</Td>
                <Td right mono>{fmt(q.income)}</Td>
                <Td right mono>{fmt(q.expenses)}</Td>
                <Td right><Money v={q.net} color={q.net >= 0 ? T.ink : T.red} /></Td>
                <Td right mono>{q.net > 0 ? fmt(q.net * (estRate / 100)) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div style={{ padding: "12px 18px", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
          The set-aside is just net profit × the rate you choose — a planning number, not a tax calculation. Your actual liability
          depends on entity type, other income, and deductions, so set the rate and confirm filings with your CPA.
        </div>
      </Card>

      {/* sales tax */}
      <Card style={{ padding: 0, maxWidth: 660 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 700, fontSize: 14 }}>Estimated sales tax collected — {year}</div>
        {salesTaxRows.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: T.muted }}>
            No location has a sales tax rate set. Add each location's rate under Business &amp; Locations to estimate what you owe.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr><Th>Location</Th><Th right>Q1</Th><Th right>Q2</Th><Th right>Q3</Th><Th right>Q4</Th><Th right>Year</Th></tr></thead>
            <tbody>
              {salesTaxRows.map((r) => (
                <tr key={r.name}>
                  <Td>{r.name} <span style={{ color: T.muted, fontSize: 11.5 }}>({r.rate}%)</span></Td>
                  {r.perQ.map((v, i) => <Td key={i} right mono>{fmt(v)}</Td>)}
                  <Td right><Money v={r.total} weight={700} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {salesTaxRows.length > 0 && (
          <div style={{ padding: "12px 18px", fontSize: 11.5, color: T.muted }}>
            Assumes recorded register totals include sales tax. Estimated tax = total − total ÷ (1 + rate).
          </div>
        )}
      </Card>

      {/* 1099 helper */}
      <Card style={{ padding: 0, maxWidth: 660 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 700, fontSize: 14 }}>Possible 1099 vendors — {year}</div>
        {v1099.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: T.muted }}>No vendors paid $600+ by cash, check, or ACH this year. (Card payments are generally reported by the processor, not by you.)</div>
        ) : (
          <>
            {v1099.map((v, i) => (
              <div key={v.name} style={{ display: "flex", justifyContent: "space-between", padding: "11px 18px", borderBottom: i < v1099.length - 1 ? `1px solid ${T.line}` : "none", fontSize: 13.5 }}>
                <span style={{ fontWeight: 600 }}>{v.name}</span><Money v={v.amt} />
              </div>
            ))}
            <div style={{ padding: "12px 18px", fontSize: 11.5, color: T.muted }}>
              Vendors paid $600+ by cash/check/ACH may need a 1099-NEC depending on what they were paid for and their entity type — confirm with your CPA.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ---------------- settings: business profile + locations ---------------- */
function SettingsView({ data, up, biz, acct, saveAcct, deleteBusiness }) {
  const [bizName, setBizName] = useState(biz?.name || "");
  const [ein, setEin] = useState(biz?.ein || "");
  const [entity, setEntity] = useState(biz?.entity || "LLC");
  const blankLoc = { name: "", address: "", city: "", phone: "", taxRate: "", manager: "" };
  const [locForm, setLocForm] = useState(blankLoc);
  const [editingLocId, setEditingLocId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setBizName(biz?.name || ""); setEin(biz?.ein || ""); setEntity(biz?.entity || "LLC"); }, [biz?.id]);

  const saveBizProfile = () => {
    saveAcct({ ...acct, businesses: acct.businesses.map((b) => (b.id === biz.id ? { ...b, name: bizName.trim() || b.name, ein: ein.trim(), entity } : b)) });
  };

  const saveLoc = () => {
    if (!locForm.name.trim()) return;
    const locs = data.settings.locations;
    if (editingLocId) {
      const old = locs.find((l) => l.id === editingLocId);
      const newName = locForm.name.trim();
      // rename references in transactions if the name changed
      const renamed = old && old.name !== newName;
      up({
        settings: { ...data.settings, locations: locs.map((l) => (l.id === editingLocId ? { ...locForm, id: editingLocId, name: newName } : l)) },
        ...(renamed ? {
          sales: data.sales.map((s) => (s.location === old.name ? { ...s, location: newName } : s)),
          expenses: data.expenses.map((e) => (e.location === old.name ? { ...e, location: newName } : e)),
          invoices: data.invoices.map((i) => (i.location === old.name ? { ...i, location: newName } : i)),
        } : {}),
      });
    } else {
      up({ settings: { ...data.settings, locations: [...locs, { ...locForm, id: uid(), name: locForm.name.trim() }] } });
    }
    setLocForm(blankLoc); setEditingLocId(null);
  };

  const locUsage = (name) =>
    data.sales.filter((s) => s.location === name).length +
    data.expenses.filter((e) => e.location === name).length +
    data.invoices.filter((i) => i.location === name).length;

  const delLoc = (l) => up({ settings: { ...data.settings, locations: data.settings.locations.filter((x) => x.id !== l.id) } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      {/* business profile */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Building2 size={15} /> Business profile</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Business name" flex={2}><Input value={bizName} onChange={(e) => setBizName(e.target.value)} /></Field>
          <Field label="Entity" flex={1}>
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option>LLC</option><option>S-Corp</option><option>C-Corp</option><option>Partnership</option><option>Sole Proprietor</option>
            </Select>
          </Field>
          <Field label="EIN" flex={1}><Input placeholder="XX-XXXXXXX" value={ein} onChange={(e) => setEin(e.target.value)} /></Field>
          <Btn onClick={saveBizProfile}><Check size={14} /> Save</Btn>
        </div>
      </Card>

      {/* locations */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><MapPin size={15} /> Locations</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
          Every sale, expense, and invoice is tagged to one of these. The sales tax rate is used by the Tax Center and balance sheet.
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Location name" flex={1}><Input placeholder="e.g. Norco" value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} /></Field>
          <Field label="Street address" flex={2}><Input placeholder="123 Hamner Ave" value={locForm.address} onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} /></Field>
          <Field label="City, State ZIP" flex={1}><Input placeholder="Norco, CA 92860" value={locForm.city} onChange={(e) => setLocForm({ ...locForm, city: e.target.value })} /></Field>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <Field label="Phone"><Input placeholder="(951) 555-0123" value={locForm.phone} onChange={(e) => setLocForm({ ...locForm, phone: e.target.value })} style={{ width: 160 }} /></Field>
          <Field label="Sales tax rate %"><Input placeholder="8.75" value={locForm.taxRate} onChange={(e) => setLocForm({ ...locForm, taxRate: e.target.value })} style={{ width: 120, fontFamily: MONO }} /></Field>
          <Field label="Manager (optional)" flex={1}><Input placeholder="Who runs this spot" value={locForm.manager} onChange={(e) => setLocForm({ ...locForm, manager: e.target.value })} /></Field>
          {editingLocId && <Btn kind="ghost" onClick={() => { setLocForm(blankLoc); setEditingLocId(null); }}>Cancel</Btn>}
          <Btn onClick={saveLoc} disabled={!locForm.name.trim()}><Check size={14} /> {editingLocId ? "Save changes" : "Add location"}</Btn>
        </div>

        <div style={{ marginTop: 18 }}>
          {data.settings.locations.length === 0 ? (
            <div style={{ fontSize: 13, color: T.amberDark, fontWeight: 600 }}>No locations yet — add your first one above to unlock sales, expenses, and invoices.</div>
          ) : data.settings.locations.map((l, i, arr) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 4px", borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.name}{l.taxRate ? <span style={{ fontWeight: 500, color: T.muted, fontSize: 12 }}> · {l.taxRate}% tax</span> : null}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{[l.address, l.city, l.phone, l.manager && `Mgr: ${l.manager}`].filter(Boolean).join(" · ") || "No details yet"}</div>
              </div>
              <span style={{ fontSize: 11.5, color: T.muted }}>{locUsage(l.name)} txns</span>
              <Btn kind="ghost" small onClick={() => { setLocForm({ ...l }); setEditingLocId(l.id); }}><Pencil size={13} /></Btn>
              <Btn kind="danger" small onClick={() => delLoc(l)} disabled={locUsage(l.name) > 0}><Trash2 size={14} /></Btn>
            </div>
          ))}
        </div>
        {data.settings.locations.some((l) => locUsage(l.name) > 0) && (
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10 }}>Locations with transactions can't be deleted. Renaming a location updates all its transactions.</div>
        )}
      </Card>

      {/* email connection */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><Mail size={15} /> Gmail connection</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Lets the Import page scan your inbox for invoices and receipts. Connect Gmail to Claude first
          (claude.ai → Settings → Connectors → Gmail), then paste the Gmail connector's server URL here.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Gmail MCP server URL" flex={1}>
            <Input placeholder="https://…" value={data.settings.gmailMcpUrl || ""}
              onChange={(e) => up({ settings: { ...data.settings, gmailMcpUrl: e.target.value.trim() } })} />
          </Field>
          <Badge tone={data.settings.gmailMcpUrl ? "green" : "gray"}>{data.settings.gmailMcpUrl ? "Configured" : "Not connected"}</Badge>
        </div>
      </Card>

      {/* danger zone */}
      <Card style={{ padding: 20, borderColor: T.redBg }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: T.red }}>Danger zone</div>
        {!confirmDelete ? (
          <Btn kind="ghost" small onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete this business…</Btn>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>Permanently delete {biz?.name} and all its books?</span>
            <Btn kind="ghost" small onClick={() => setConfirmDelete(false)}>Keep it</Btn>
            <Btn small onClick={() => deleteBusiness(biz.id)}><Trash2 size={13} /> Yes, delete everything</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- import (drop Excel, CSV, PDF, DOCX, images) ---------------- */
const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Couldn't read file"));
    r.readAsDataURL(file);
  });

async function askClaude(content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
    }),
  });
  const d = await res.json();
  const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const excelSerialToISO = (n) => {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
};
const normDate = (v) => {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 60000) return excelSerialToISO(v);
  const p = new Date(v);
  return isNaN(p) ? null : p.toISOString().slice(0, 10);
};

function ImportView({ data, up, setView, locNames }) {
  const [jobs, setJobs] = useState([]);
  const [pending, setPending] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const expAccts = data.accounts.filter((a) => a.type === "Expense");
  const acctNames = expAccts.map((a) => a.name);
  const defaultAcct = expAccts.find((a) => a.name.includes("Other") || a.name.includes("Supplies")) || expAccts[0];
  const matchAcct = (name) => {
    if (!name) return defaultAcct?.id || "";
    const n = String(name).toLowerCase();
    const hit = expAccts.find((a) => a.name.toLowerCase() === n) ||
      expAccts.find((a) => a.name.toLowerCase().includes(n) || n.includes(a.name.toLowerCase()));
    return (hit || defaultAcct)?.id || "";
  };

  if (locNames.length === 0) return <NeedLocation setView={setView} />;

  const setJob = (id, patch) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const addPendingExpense = (x, source) =>
    setPending((p) => [...p, {
      id: uid(), kind: "expense", include: true, source,
      date: x.date || todayISO(), amount: Math.abs(parseAmt(x.amount ?? x.total)),
      vendorName: x.vendor || "", memo: x.memo || "", accountId: matchAcct(x.category),
      location: locNames[0] || "",
    }]);
  const addPendingSale = (x, source) =>
    setPending((p) => [...p, {
      id: uid(), kind: "sale", include: true, source,
      date: x.date || todayISO(), amount: Math.abs(parseAmt(x.amount)),
      memo: x.memo || "", channel: x.channel || "POS",
      location: locNames.includes(x.location) ? x.location : (locNames[0] || ""),
    }]);

  const handleSheet = async (file, jobId) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!rows.length) throw new Error("No rows found in the first sheet");
    const headers = Object.keys(rows[0]);
    const sample = rows.slice(0, 5).map((r) => {
      const o = {};
      headers.forEach((h) => { o[h] = r[h] instanceof Date ? r[h].toISOString().slice(0, 10) : r[h]; });
      return o;
    });

    setJob(jobId, { status: "thinking", note: "Mapping columns…" });
    const map = await askClaude(
      `You are mapping a small-business bookkeeping spreadsheet. Columns: ${JSON.stringify(headers)}. Sample rows: ${JSON.stringify(sample)}.
Respond ONLY with JSON, no markdown, no preamble:
{"type":"expenses" or "sales","dateCol":string|null,"amountCol":string|null,"memoCol":string|null,"vendorCol":string|null,"locationCol":string|null,"channelCol":string|null,"categoryCol":string|null}
"sales" means revenue/register/deposit rows; "expenses" means purchases/bills/spending. Column values must be exact strings from the column list or null.`
    );
    if (!map.amountCol) throw new Error("Couldn't find an amount column");

    let added = 0;
    rows.forEach((r) => {
      const amount = Math.abs(parseAmt(r[map.amountCol]));
      if (!amount) return;
      const date = normDate(map.dateCol ? r[map.dateCol] : null) || todayISO();
      if (map.type === "sales") {
        addPendingSale({ date, amount, memo: map.memoCol ? String(r[map.memoCol]) : "", channel: map.channelCol ? String(r[map.channelCol]) : "POS", location: map.locationCol ? String(r[map.locationCol]) : "" }, file.name);
      } else {
        addPendingExpense({ date, amount, memo: map.memoCol ? String(r[map.memoCol]) : "", vendor: map.vendorCol ? String(r[map.vendorCol]) : "", category: map.categoryCol ? String(r[map.categoryCol]) : "" }, file.name);
      }
      added++;
    });
    setJob(jobId, { status: "done", note: `${added} ${map.type} rows ready for review` });
  };

  const extractPrompt = `Extract bookkeeping data from this document for a small business's books.
Respond ONLY with JSON, no markdown, no preamble:
{"docType":"receipt"|"invoice"|"statement"|"other","vendor":string,"date":"YYYY-MM-DD"|null,"total":number,"memo":string (short summary of what was purchased),"category":string (pick the closest from this list: __CATS__)}
If the document contains multiple separate transactions, instead respond {"multiple":[{...},{...}]} with the same fields per item.`;

  const handleDoc = async (file, jobId) => {
    setJob(jobId, { status: "thinking", note: "Reading with Claude…" });
    let content;
    const prompt = extractPrompt.replace("__CATS__", JSON.stringify(acctNames));
    if (file.type === "application/pdf") {
      const b64 = await fileToBase64(file);
      content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: prompt }];
    } else if (file.type.startsWith("image/")) {
      const b64 = await fileToBase64(file);
      content = [{ type: "image", source: { type: "base64", media_type: file.type, data: b64 } }, { type: "text", text: prompt }];
    } else {
      const buf = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
      content = [{ type: "text", text: prompt + "\n\nDOCUMENT TEXT:\n" + value.slice(0, 8000) }];
    }
    const out = await askClaude(content);
    const items = out.multiple || [out];
    items.forEach((x) => addPendingExpense(x, file.name));
    setJob(jobId, { status: "done", note: `${items.length} transaction${items.length > 1 ? "s" : ""} extracted — review below` });
  };

  const processFiles = (files) => {
    [...files].forEach(async (file) => {
      const jobId = uid();
      setJobs((js) => [...js, { id: jobId, name: file.name, status: "reading", note: "Reading file…" }]);
      try {
        const ext = file.name.split(".").pop().toLowerCase();
        if (["xlsx", "xls", "csv"].includes(ext)) await handleSheet(file, jobId);
        else if (["pdf", "png", "jpg", "jpeg", "webp", "gif", "docx"].includes(ext)) await handleDoc(file, jobId);
        else throw new Error("Unsupported file type");
      } catch (err) {
        setJob(jobId, { status: "error", note: err.message || "Something went wrong" });
      }
    });
  };

  const setPRow = (id, patch) => setPending((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const commit = () => {
    const rows = pending.filter((r) => r.include && r.amount > 0);
    let vendors = [...data.vendors];
    const findOrCreateVendor = (name) => {
      if (!name || !name.trim()) return "";
      const n = name.trim();
      let v = vendors.find((x) => x.name.toLowerCase() === n.toLowerCase());
      if (!v) { v = { id: uid(), name: n, category: "" }; vendors.push(v); }
      return v.id;
    };
    const newExpenses = rows.filter((r) => r.kind === "expense").map((r) => ({
      id: uid(), date: r.date, vendorId: findOrCreateVendor(r.vendorName), accountId: r.accountId || defaultAcct?.id,
      amount: r.amount, memo: r.memo, method: "Card", location: r.location,
    }));
    const newSales = rows.filter((r) => r.kind === "sale").map((r) => ({
      id: uid(), date: r.date, location: locNames.includes(r.location) ? r.location : (locNames[0] || ""),
      channel: r.channel, amount: r.amount, memo: r.memo,
    }));
    up({ expenses: [...data.expenses, ...newExpenses], sales: [...data.sales, ...newSales], vendors });
    setPending([]); setJobs([]);
    setView(newSales.length && !newExpenses.length ? "sales" : "expenses");
  };

  const includedCount = pending.filter((r) => r.include).length;
  const includedTotal = pending.filter((r) => r.include).reduce((s, r) => s + r.amount, 0);

  /* ---- Gmail scan ---- */
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailNote, setGmailNote] = useState("");
  const scanGmail = async () => {
    const url = data.settings.gmailMcpUrl;
    if (!url) { setView("settings"); return; }
    setGmailBusy(true); setGmailNote("Searching your inbox…");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Search this Gmail inbox for invoices, bills, and receipts from the last 60 days (try queries like "invoice", "receipt", "your order", "statement"). Read the most relevant ones. Then respond ONLY with JSON, no markdown, no preamble:
{"transactions":[{"vendor":string,"date":"YYYY-MM-DD","total":number,"memo":string (what it was for),"category":string (closest match from: ${JSON.stringify(acctNames)})}]}
Include at most 15 items. Skip personal (non-business) emails, marketing, and anything without a dollar amount. If nothing is found, respond {"transactions":[]}.`,
          }],
          mcp_servers: [{ type: "url", url, name: "gmail" }],
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error.message || "Gmail request failed");
      const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Couldn't read anything usable from the inbox");
      const out = JSON.parse(m[0]);
      const items = out.transactions || [];
      items.forEach((x) => addPendingExpense({ ...x, amount: x.total }, "Gmail"));
      setGmailNote(items.length ? `${items.length} invoice${items.length > 1 ? "s" : ""} found — review below` : "No business invoices found in the last 60 days.");
    } catch (err) {
      setGmailNote(`Couldn't scan Gmail: ${err.message}. Check the connection under Business & Locations.`);
    }
    setGmailBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); processFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current && inputRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? T.amber : T.lineDark}`, borderRadius: 14,
          background: dragOver ? "#FDF3E6" : T.card, padding: "44px 24px", textAlign: "center",
          cursor: "pointer", transition: "all .15s",
        }}
      >
        <FileUp size={30} style={{ color: T.amber, margin: "0 auto 10px" }} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>Drop files here, or click to browse</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5 }}>
          Excel / CSV transaction lists · PDF or photo of an invoice or receipt · Word docs
        </div>
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif"
          style={{ display: "none" }} onChange={(e) => { processFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* Gmail scan */}
      <Card style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Mail size={20} color={T.amberDark} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Pull invoices from Gmail</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            {gmailNote || (data.settings.gmailMcpUrl
              ? "Scans the last 60 days of your inbox for bills and receipts."
              : "Not connected yet — set it up under Business & Locations.")}
          </div>
        </div>
        {data.settings.gmailMcpUrl ? (
          <Btn small onClick={scanGmail} disabled={gmailBusy}>
            {gmailBusy ? <Loader2 size={13} style={{ animation: "bbspin 1s linear infinite" }} /> : <Mail size={13} />}
            {gmailBusy ? " Scanning…" : " Scan inbox"}
          </Btn>
        ) : (
          <Btn kind="ghost" small onClick={() => setView("settings")}>Connect Gmail</Btn>
        )}
      </Card>

      {jobs.length > 0 && (
        <Card style={{ padding: 0 }}>
          {jobs.map((j, i) => (
            <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: i < jobs.length - 1 ? `1px solid ${T.line}` : "none" }}>
              {j.status === "error" ? <AlertCircle size={15} color={T.red} /> :
                j.status === "done" ? <Check size={15} color={T.green} /> :
                <Loader2 size={15} color={T.amber} style={{ animation: "bbspin 1s linear infinite" }} />}
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{j.name}</span>
              <span style={{ fontSize: 12, color: j.status === "error" ? T.red : T.muted }}>{j.note}</span>
            </div>
          ))}
          <style>{`@keyframes bbspin { to { transform: rotate(360deg); } }`}</style>
        </Card>
      )}

      {pending.length > 0 && (
        <Card style={{ padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${T.line}` }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Review before adding to the books</div>
              <div style={{ fontSize: 12, color: T.muted }}>{includedCount} of {pending.length} selected · {fmt(includedTotal)}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn kind="ghost" small onClick={() => { setPending([]); setJobs([]); }}>Discard all</Btn>
              <Btn small onClick={commit} disabled={includedCount === 0}><Check size={14} /> Add {includedCount} to books</Btn>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: T.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {["", "Type", "Date", "Vendor / memo", "Category / channel", "Location", "Amount"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}`, textAlign: h === "Amount" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} style={{ opacity: r.include ? 1 : 0.42 }}>
                    <td style={{ ...td, padding: "8px 14px" }}>
                      <input type="checkbox" checked={r.include} onChange={(e) => setPRow(r.id, { include: e.target.checked })} />
                    </td>
                    <td style={{ ...td, padding: "8px 14px" }}>
                      <Badge tone={r.kind === "sale" ? "green" : "red"}>{r.kind === "sale" ? "Sale" : "Expense"}</Badge>
                    </td>
                    <td style={{ ...td, padding: "8px 14px" }}>
                      <Input type="date" value={r.date} onChange={(e) => setPRow(r.id, { date: e.target.value })} style={{ width: 140, padding: "5px 8px", fontSize: 12.5 }} />
                    </td>
                    <td style={{ ...td, padding: "8px 14px", minWidth: 200 }}>
                      {r.kind === "expense" && (
                        <Input placeholder="Vendor" value={r.vendorName} onChange={(e) => setPRow(r.id, { vendorName: e.target.value })} style={{ padding: "5px 8px", fontSize: 12.5, marginBottom: 4 }} />
                      )}
                      <Input placeholder="Memo" value={r.memo} onChange={(e) => setPRow(r.id, { memo: e.target.value })} style={{ padding: "5px 8px", fontSize: 12.5 }} />
                    </td>
                    <td style={{ ...td, padding: "8px 14px" }}>
                      {r.kind === "expense" ? (
                        <Select value={r.accountId} onChange={(e) => setPRow(r.id, { accountId: e.target.value })} style={{ width: 190, padding: "5px 8px", fontSize: 12.5 }}>
                          {expAccts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                      ) : (
                        <Select value={r.channel} onChange={(e) => setPRow(r.id, { channel: e.target.value })} style={{ width: 130, padding: "5px 8px", fontSize: 12.5 }}>
                          <option>POS</option><option>Catering</option><option>Wholesale</option><option>Online</option><option>Other</option>
                        </Select>
                      )}
                    </td>
                    <td style={{ ...td, padding: "8px 14px" }}>
                      <Select value={r.location} onChange={(e) => setPRow(r.id, { location: e.target.value })} style={{ width: 130, padding: "5px 8px", fontSize: 12.5 }}>
                        {locNames.map((l) => <option key={l}>{l}</option>)}
                      </Select>
                    </td>
                    <td style={{ ...td, padding: "8px 14px", textAlign: "right" }}>
                      <Input value={r.amount} onChange={(e) => setPRow(r.id, { amount: parseAmt(e.target.value) })} style={{ width: 100, padding: "5px 8px", fontSize: 12.5, fontFamily: MONO, textAlign: "right" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pending.length === 0 && jobs.length === 0 && (
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
          <b style={{ color: T.inkSoft }}>How it works:</b> spreadsheets are read locally and the columns get mapped automatically.
          Receipts, invoices (PDF or photo), and Word docs are read by Claude, which pulls out the vendor, date, total, and a
          suggested category. Nothing touches your books until you hit <b style={{ color: T.inkSoft }}>Add to books</b>.
        </div>
      )}
    </div>
  );
}
