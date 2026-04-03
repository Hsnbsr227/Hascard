import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs, query, orderBy,
    deleteDoc, doc, getDoc, updateDoc, setDoc, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKDafA6zXmdqDU6Fd9gE434sW3CYT1dCE",
    authDomain: "origincard-f2676.firebaseapp.com",
    projectId: "origincard-f2676",
    storageBucket: "origincard-f2676.firebasestorage.app",
    messagingSenderId: "837946557108",
    appId: "1:837946557108:web:7b61c25ef8399473864de1",
    measurementId: "G-WHPE66ENDP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let loginAttempts = 0;
let allUsersCache = [];
let activityChart = null;
let rarityChart = null;
let currentChartRange = '7';

// ══════════════════════════════════════
// GÜVENLİK
// ══════════════════════════════════════
onAuthStateChanged(auth, (user) => {
    if (!user || user.email !== "admin@gmail.com") {
        window.location.href = "mainpage.html";
    }
});

window.verifyPin = () => {
    const pinInput = document.getElementById('adminPin');
    if (pinInput.value === "1212") {
        document.getElementById('auth-wall').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'flex';
        showSection('dashboard');
    } else {
        loginAttempts++;
        if (loginAttempts >= 2) window.location.href = "mainpage.html";
        else document.getElementById('pin-error').innerText = "❌ Hatalı Kod!";
        document.getElementById('adminPin').value = '';
        for (let i = 1; i <= 4; i++) {
            const d = document.getElementById(`d${i}`);
            if (d) d.classList.remove('filled');
        }
    }
};

// ══════════════════════════════════════
// NADİRLİK RENK
// ══════════════════════════════════════
const getRarityColor = (rarity = '') => {
    if (rarity.includes("AA+")) return "#FFD700";
    if (rarity.includes("AA"))  return "#FF4500";
    if (rarity.includes("BB"))  return "#1E90FF";
    if (rarity.includes("CC"))  return "#C0C0C0";
    if (rarity.includes("FF"))  return "#32CD32";
    return "#555";
};

const statusLabel = (s) => {
    if (s === 'banned') return '<span class="badge badge-banned">Banlı</span>';
    if (s === 'suspended') return '<span class="badge badge-suspended">Askıda</span>';
    return '<span class="badge badge-active">Aktif</span>';
};

const roleLabel = (r) => r === 'admin'
    ? '<span class="badge badge-admin">Admin</span>'
    : '<span class="badge badge-user">Kullanıcı</span>';

// ══════════════════════════════════════
// SEKSİYON YÖNETİMİ
// ══════════════════════════════════════
const sections = {
    'dashboard':      { el: 'dashboard-section',      nav: 'nav-dashboard',      title: 'Genel Bakış' },
    'users':          { el: 'users-section',           nav: 'nav-users',          title: 'Kullanıcı Yönetimi' },
    'add-card':       { el: 'add-card-section',        nav: 'nav-add-card',       title: 'Yeni Kart Ekle' },
    'card-pool':      { el: 'card-pool-section',       nav: 'nav-card-pool',      title: 'Kart Havuzu' },
    'coin-packages':  { el: 'coin-packages-section',   nav: 'nav-coin-packages',  title: 'Coin Paketleri' },
};

window.showSection = function(id) {
    Object.values(sections).forEach(s => {
        const el = document.getElementById(s.el);
        if (el) el.style.display = 'none';
        const nav = document.getElementById(s.nav);
        if (nav) nav.classList.remove('active');
    });

    const s = sections[id];
    if (!s) return;
    const el = document.getElementById(s.el);
    if (el) el.style.display = 'block';
    const nav = document.getElementById(s.nav);
    if (nav) nav.classList.add('active');
    const title = document.getElementById('topbar-title');
    if (title) title.textContent = s.title;

    if (id === 'dashboard')     loadDashboard();
    if (id === 'users')         loadUsers();
    if (id === 'card-pool')     window.loadCardPool();
    if (id === 'coin-packages') window.loadCoinPackages();
};

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
async function loadDashboard() {
    try {
        const [usersSnap, cardsSnap, userCardsSnap, tradesSnap] = await Promise.all([
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'allCards')),
            getDocs(collection(db, 'userCards')),
            getDocs(collection(db, 'trades')).catch(() => ({ size: 0, docs: [] }))
        ]);

        // KPI
        document.getElementById('kpi-users').textContent = usersSnap.size;
        document.getElementById('kpi-cards').textContent = userCardsSnap.size;
        document.getElementById('kpi-trades').textContent = tradesSnap.size || '—';

        let totalHC = 0;
        usersSnap.forEach(d => { totalHC += (d.data().hasCoin || 0); });
        document.getElementById('kpi-hc').textContent = totalHC.toLocaleString('tr-TR');

        // Kullanıcı aktivite grafiği
        buildActivityChart(usersSnap.docs, currentChartRange);

        // Nadirlik grafiği
        buildRarityChart(cardsSnap.docs);

        // En aktif kullanıcılar (HC'ye göre)
        buildTopUsers(usersSnap.docs);

        // En çok kart sahibi kartlar
        buildTopCards(userCardsSnap.docs);

        // Son işlemler
        buildRecentTrades(tradesSnap.docs || []);

    } catch(e) { console.error('Dashboard yükleme hatası:', e); }
}

function buildActivityChart(userDocs, range) {
    const days = parseInt(range);
    const counts = {};
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        counts[d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })] = 0;
    }

    userDocs.forEach(d => {
        const data = d.data();
        const ts = data.createdAt?.toDate?.() || (data.createdAt ? new Date(data.createdAt) : null);
        if (!ts) return;
        const diff = Math.floor((now - ts) / 86400000);
        if (diff < days) {
            const key = ts.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
            if (counts[key] !== undefined) counts[key]++;
        }
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    if (activityChart) activityChart.destroy();

    const ctx = document.getElementById('activityChart');
    if (!ctx) return;

    activityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Yeni Kayıt',
                data,
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255,193,7,0.07)',
                borderWidth: 2,
                pointBackgroundColor: '#ffc107',
                pointRadius: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#666', font: { family: 'Poppins', weight: '700', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#666', font: { family: 'Poppins', weight: '700', size: 11 }, stepSize: 1 }
                }
            }
        }
    });
}

window.setChartRange = function(range, btn) {
    currentChartRange = range;
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    getDocs(collection(db, 'users')).then(snap => buildActivityChart(snap.docs, range));
};

function buildRarityChart(cardDocs) {
    const counts = { 'AA+': 0, 'AA': 0, 'BB': 0, 'CC': 0, 'FF': 0 };
    cardDocs.forEach(d => {
        const r = d.data().rarity || '';
        if (r.includes('AA+')) counts['AA+']++;
        else if (r.includes('AA')) counts['AA']++;
        else if (r.includes('BB')) counts['BB']++;
        else if (r.includes('CC')) counts['CC']++;
        else if (r.includes('FF')) counts['FF']++;
    });

    if (rarityChart) rarityChart.destroy();
    const ctx = document.getElementById('rarityChart');
    if (!ctx) return;

    rarityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['AA+ LEGEND', 'AA EPIC', 'BB ORIGIN', 'CC STANDART', 'FF TALENT'],
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#FFD700', '#FF4500', '#1E90FF', '#C0C0C0', '#32CD32'],
                borderColor: '#0d0d12',
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#4a4a5e',
                        font: { family: 'Poppins', weight: '700', size: 11 },
                        padding: 14, boxWidth: 10, boxHeight: 10,
                    }
                }
            },
            cutout: '65%'
        }
    });
}

function buildTopUsers(userDocs) {
    const sorted = userDocs
        .map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (b.hasCoin || 0) - (a.hasCoin || 0))
        .slice(0, 5);

    const container = document.getElementById('top-users-list');
    if (!container) return;

    if (!sorted.length) { container.innerHTML = '<div class="list-loading">Kullanıcı bulunamadı</div>'; return; }

    container.innerHTML = sorted.map((u, i) => `
        <div class="ranked-item">
            <div class="ranked-num ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
            <div class="ranked-avatar">
                <img src="https://api.dicebear.com/7.x/notionists/svg?seed=${u.displayName||'user'}" alt="">
            </div>
            <div class="ranked-name">${u.displayName || u.email?.split('@')[0] || '—'}</div>
            <div class="ranked-val hc-mono">${(u.hasCoin||0).toLocaleString('tr-TR')} HC</div>
        </div>
    `).join('');
}

function buildTopCards(userCardDocs) {
    const counts = {};
    userCardDocs.forEach(d => {
        const data = d.data();
        const name = data.name || data.cardName || '?';
        counts[name] = (counts[name] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const container = document.getElementById('top-cards-list');
    if (!container) return;

    if (!sorted.length) { container.innerHTML = '<div class="list-loading">Veri yok</div>'; return; }

    container.innerHTML = sorted.map(([name, count], i) => `
        <div class="ranked-item">
            <div class="ranked-num ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
            <div class="ranked-avatar">${name.charAt(0)}</div>
            <div class="ranked-name">${name}</div>
            <div class="ranked-val">${count} adet</div>
        </div>
    `).join('');
}

function buildRecentTrades(tradeDocs) {
    const container = document.getElementById('recent-trades-list');
    if (!container) return;

    if (!tradeDocs.length) {
        container.innerHTML = '<div class="list-loading">Henüz işlem yok</div>';
        return;
    }

    const sorted = tradeDocs
        .map(d => ({ ...d.data(), id: d.id }))
        .sort((a,b) => {
            const ta = a.createdAt?.toDate?.() || new Date(0);
            const tb = b.createdAt?.toDate?.() || new Date(0);
            return tb - ta;
        })
        .slice(0, 6);

    container.innerHTML = sorted.map(t => `
        <div class="ranked-item">
            <div class="ranked-avatar">${(t.cardName||'?').charAt(0)}</div>
            <div class="ranked-name" style="font-size:12px;">
                <div style="font-weight:800;color:#e0e0e8;">${t.cardName||'—'}</div>
                <div style="color:#4a4a5e;font-size:11px;">@${t.sellerName||'?'} → @${t.buyerName||'?'}</div>
            </div>
            <div class="ranked-val hc-mono">${(t.price||0).toLocaleString('tr-TR')} HC</div>
        </div>
    `).join('');
}

// ══════════════════════════════════════
// KULLANICI YÖNETİMİ
// ══════════════════════════════════════
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><span class="material-symbols-outlined spin">sync</span> Yükleniyor...</td></tr>';

    try {
        const snap = await getDocs(collection(db, 'users'));
        allUsersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        document.getElementById('user-total-count').textContent = allUsersCache.length;
        renderUsers(allUsersCache);
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-loading" style="color:#ff4444;">Yükleme hatası!</td></tr>';
        console.error(e);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Kullanıcı bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const name = u.displayName || u.email?.split('@')[0] || '—';
        const email = u.email || '—';
        const role = u.role || 'user';
        const status = u.status || 'active';
        const hc = (u.hasCoin || 0).toLocaleString('tr-TR');
        const createdAt = u.createdAt?.toDate?.()
            ? u.createdAt.toDate().toLocaleDateString('tr-TR')
            : (u.createdAt ? new Date(u.createdAt).toLocaleDateString('tr-TR') : '—');

        return `
        <tr data-uid="${u.id}" data-name="${name.toLowerCase()}" data-email="${email.toLowerCase()}" data-role="${role}" data-status="${status}">
            <td>
                <div class="user-cell">
                    <div class="user-cell-avatar">
                        <img src="https://api.dicebear.com/7.x/notionists/svg?seed=${name}" alt="">
                    </div>
                    <div>
                        <div class="user-cell-name">${name}</div>
                    </div>
                </div>
            </td>
            <td><span class="user-cell-email">${email}</span></td>
            <td>${roleLabel(role)}</td>
            <td>${statusLabel(status)}</td>
            <td><span class="hc-mono" style="color:#ffc107;">${hc} HC</span></td>
            <td style="color:#4a4a5e;">${createdAt}</td>
            <td>
                <div class="table-actions">
                    <button class="table-btn" title="Düzenle" onclick="openUserModal('${u.id}')">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="table-btn danger" title="Sil" onclick="deleteUser('${u.id}', '${name}')">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

window.filterUsers = function() {
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const role   = document.getElementById('user-role-filter')?.value || '';
    const status = document.getElementById('user-status-filter')?.value || '';

    const filtered = allUsersCache.filter(u => {
        const name  = (u.displayName || u.email || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const matchSearch = !search || name.includes(search) || email.includes(search);
        const matchRole   = !role   || (u.role || 'user') === role;
        const matchStatus = !status || (u.status || 'active') === status;
        return matchSearch && matchRole && matchStatus;
    });

    renderUsers(filtered);
};

window.openUserModal = async function(uid) {
    const modal = document.getElementById('user-modal');
    const content = document.getElementById('user-modal-content');
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align:center;padding:40px;color:#4a4a5e;">Yükleniyor...</div>';

    try {
        const u = allUsersCache.find(u => u.id === uid);
        if (!u) throw new Error('Kullanıcı bulunamadı');

        const name = u.displayName || u.email?.split('@')[0] || '—';

        // Kullanıcının kart sayısını al
        let cardCount = 0;
        try {
            const cardsSnap = await getDocs(query(collection(db, 'userCards'), where('ownerEmail', '==', u.email)));
            cardCount = cardsSnap.size;
        } catch(_) {}

        content.innerHTML = `
            <div class="user-modal-header">
                <div class="user-modal-avatar">
                    <img src="https://api.dicebear.com/7.x/notionists/svg?seed=${name}" alt="">
                </div>
                <div>
                    <div class="user-modal-name">${name}</div>
                    <div class="user-modal-email">${u.email || '—'}</div>
                </div>
            </div>

            <div class="modal-section">
                <div class="modal-section-label">İstatistikler</div>
                <div class="stat-mini-grid">
                    <div class="stat-mini">
                        <div class="stat-mini-val hc-mono">${(u.hasCoin||0).toLocaleString('tr-TR')}</div>
                        <div class="stat-mini-label">HAS COIN</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-val">${cardCount}</div>
                        <div class="stat-mini-label">Kart</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-val">${u.totalHp || '—'}</div>
                        <div class="stat-mini-label">HP Gücü</div>
                    </div>
                </div>
            </div>

            <div class="modal-section">
                <div class="modal-section-label">Hesap Durumu</div>
                <div class="modal-actions">
                    <button class="action-btn green" onclick="setUserStatus('${uid}', 'active')">
                        <span class="material-symbols-outlined">check_circle</span> Aktif Yap
                    </button>
                    <button class="action-btn orange" onclick="setUserStatus('${uid}', 'suspended')">
                        <span class="material-symbols-outlined">pause_circle</span> Askıya Al
                    </button>
                    <button class="action-btn red" onclick="setUserStatus('${uid}', 'banned')">
                        <span class="material-symbols-outlined">block</span> Banla
                    </button>
                </div>
            </div>

            <div class="modal-section">
                <div class="modal-section-label">HC Ayarla</div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <input type="number" id="hc-set-val" placeholder="Miktar gir..." value="${u.hasCoin||0}"
                        style="flex:1;background:#0a0a12;border:1px solid #222;color:#fff;padding:10px 14px;border-radius:8px;font-family:'Poppins',sans-serif;font-size:14px;outline:none;">
                    <button class="action-btn gold" onclick="setUserHC('${uid}')">
                        <span class="material-symbols-outlined">savings</span> Kaydet
                    </button>
                </div>
            </div>

            <div class="modal-section">
                <div class="modal-section-label">Rol Yönetimi</div>
                <div class="modal-actions">
                    <button class="action-btn gold" onclick="setUserRole('${uid}', 'admin')">
                        <span class="material-symbols-outlined">shield</span> Admin Yap
                    </button>
                    <button class="action-btn gray" onclick="setUserRole('${uid}', 'user')">
                        <span class="material-symbols-outlined">person</span> Kullanıcı Yap
                    </button>
                </div>
            </div>

            <div class="modal-section">
                <div class="modal-section-label">Tehlikeli Alan</div>
                <div class="modal-actions">
                    <button class="action-btn red" onclick="deleteUser('${uid}', '${name}')">
                        <span class="material-symbols-outlined">delete_forever</span> Hesabı Sil
                    </button>
                </div>
            </div>
        `;
    } catch(e) {
        content.innerHTML = `<div style="color:#ff4444;padding:20px;">Hata: ${e.message}</div>`;
    }
};

window.closeUserModal = function() {
    document.getElementById('user-modal').style.display = 'none';
};

window.setUserStatus = async function(uid, status) {
    try {
        await updateDoc(doc(db, 'users', uid), { status });
        const u = allUsersCache.find(u => u.id === uid);
        if (u) u.status = status;
        showToast(`Durum güncellendi: ${status}`);
        renderUsers(allUsersCache); // Tabloyu yeniden render et
        closeUserModal();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

window.setUserRole = async function(uid, role) {
    try {
        await updateDoc(doc(db, 'users', uid), { role });
        const u = allUsersCache.find(u => u.id === uid);
        if (u) u.role = role;
        showToast(`Rol güncellendi: ${role}`);
        renderUsers(allUsersCache); // Tabloyu yeniden render et
        closeUserModal();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

window.setUserHC = async function(uid) {
    const val = parseInt(document.getElementById('hc-set-val')?.value);
    if (isNaN(val) || val < 0) { showToast('Geçersiz miktar!', 'red'); return; }
    try {
        await updateDoc(doc(db, 'users', uid), { hasCoin: val });
        const u = allUsersCache.find(u => u.id === uid);
        if (u) u.hasCoin = val;
        showToast(`HC güncellendi: ${val.toLocaleString('tr-TR')} HC`);
        renderUsers(allUsersCache); // Tabloyu yeniden render et
        closeUserModal();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

window.deleteUser = async function(uid, name) {
    if (!confirm(`"${name}" kullanıcısını silmek istediğine emin misin?\n\nBu işlem geri alınamaz!`)) return;
    try {
        await deleteDoc(doc(db, 'users', uid));
        allUsersCache = allUsersCache.filter(u => u.id !== uid);
        document.getElementById('user-total-count').textContent = allUsersCache.length;
        renderUsers(allUsersCache); // Tabloyu yeniden render et
        closeUserModal();
        showToast(`${name} silindi.`);
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

// ══════════════════════════════════════
// TOAST BİLDİRİM
// ══════════════════════════════════════
function showToast(msg, color = 'gold') {
    let t = document.getElementById('admin-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'admin-toast';
        t.style.cssText = `
            position:fixed; bottom:30px; right:30px; z-index:999999;
            padding:14px 22px; border-radius:12px;
            font-family:'Poppins',sans-serif; font-size:14px; font-weight:700;
            transition: all 0.3s; opacity:0; transform:translateY(10px);
            max-width:320px;
        `;
        document.body.appendChild(t);
    }
    const colors = {
        gold: 'background:#1a1400;border:1px solid rgba(255,193,7,0.3);color:#ffc107;',
        red:  'background:#1a0000;border:1px solid rgba(255,23,68,0.3);color:#ff4444;',
        green:'background:#001a00;border:1px solid rgba(0,230,118,0.3);color:#00e676;',
    };
    t.style.cssText += colors[color] || colors.gold;
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(10px)';
    }, 3000);
}

// ══════════════════════════════════════
// KART HAVUZU
// ══════════════════════════════════════
window.loadCardPool = async function() {
    const grid = document.getElementById('poolDisplay');

    if (!document.getElementById('adminSearchContainer')) {
        grid.insertAdjacentHTML('beforebegin', `
            <div id="adminSearchContainer" style="margin-bottom:24px;display:flex;align-items:center;gap:16px;">
                <div style="position:relative;flex:1;max-width:400px;">
                    <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#4a4a5e;font-family:'Material Symbols Outlined';font-size:18px;">search</span>
                    <input type="text" id="adminCardSearch" placeholder="Oyuncu, nadirlik veya ID ara..."
                           style="width:100%;background:#0d0d12;border:1px solid #222;color:#fff;padding:11px 14px 11px 42px;border-radius:10px;font-size:14px;font-family:'Poppins',sans-serif;outline:none;"
                           onkeyup="filterAdminCards()">
                </div>
                <div style="color:#4a4a5e;font-size:12px;font-weight:800;letter-spacing:1px;">
                    TOPLAM: <span id="totalCardCount" style="color:var(--gold);font-size:16px;">0</span>
                </div>
            </div>
        `);
    }

    grid.innerHTML = "<p style='color:#ffc107;'>Yükleniyor...</p>";

    try {
        const snap = await getDocs(query(collection(db, "allCards"), orderBy("createdAt", "desc")));
        grid.innerHTML = "";
        grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:20px;";
        document.getElementById('totalCardCount').innerText = snap.size;

        snap.forEach(docSnap => {
            const card = docSnap.data();
            const cardId = docSnap.id;
            const rColor = getRarityColor(card.rarity);
            const div = document.createElement('div');
            div.className = 'admin-mini-card';
            div.setAttribute('data-search', `${(card.name||'').toLowerCase()} ${(card.rarity||'').toLowerCase()} ${card.generalId||''}`);
            div.style.borderBottom = `2px solid ${rColor}`;
            div.onclick = () => openCardPanel(cardId);
            div.innerHTML = `
                <div style="width:100%;aspect-ratio:3/4;background:#000;border-radius:8px;overflow:hidden;margin-bottom:10px;">
                    <img src="${card.imageUrl}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                </div>
                <div style="text-align:center;">
                    <div style="color:${rColor};font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">${card.rarity}</div>
                    <div style="color:#fff;font-size:13px;font-weight:700;margin:2px 0;">${card.name}</div>
                    <div style="color:#444;font-size:11px;">#${card.generalId}</div>
                </div>
                ${card.isLimited ? `<div style="position:absolute;top:8px;right:8px;background:var(--gold);color:#000;font-size:9px;font-weight:900;padding:2px 6px;border-radius:4px;">${card.limitedNo}/${card.maxSupply}</div>` : ''}
            `;
            grid.appendChild(div);
        });
    } catch(e) { console.error(e); grid.innerHTML = '<p style="color:#ff4444;">Yükleme hatası!</p>'; }
};

window.filterAdminCards = function() {
    const term = (document.getElementById('adminCardSearch')?.value || '').toLowerCase();
    document.querySelectorAll('.admin-mini-card').forEach(c => {
        c.style.display = c.getAttribute('data-search')?.includes(term) ? "block" : "none";
    });
};

// ══════════════════════════════════════
// KART DETAY PANELİ (eski kod korundu)
// ══════════════════════════════════════
window.openCardPanel = async function(cardId) {
    const docSnap = await getDoc(doc(db, "allCards", cardId));
    if (!docSnap.exists()) return;
    const card = docSnap.data();
    const rColor = getRarityColor(card.rarity);

    const modal = document.createElement('div');
    modal.id = "adminModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(10px);";
    modal.innerHTML = `
        <div style="max-width:900px;width:100%;display:grid;grid-template-columns:300px 1fr;gap:36px;background:#0d0d12;border:1px solid #1a1a24;border-top:3px solid ${rColor};border-radius:20px;padding:36px;position:relative;">
            <button onclick="document.getElementById('adminModal').remove()" style="position:absolute;top:16px;right:20px;background:none;border:none;color:#444;font-size:28px;cursor:pointer;line-height:1;">&times;</button>
            <div style="background:#000;border-radius:12px;overflow:hidden;aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;">
                <img src="${card.imageUrl}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div style="display:flex;flex-direction:column;justify-content:center;gap:20px;">
                <div>
                    <div style="color:${rColor};font-size:11px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">${card.rarity} · #${card.generalId}</div>
                    <h1 style="color:#fff;font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:2px;line-height:1;">${card.name}</h1>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                    ${[['GEN', card.gen], ['MEVKİ', card.pos], ['HP', card.hp], ['HC', card.hc], ['DEĞERİ', card.value], ['SERİ', card.series]].map(([k,v]) => `
                        <div style="background:#0a0a12;border:1px solid #1a1a24;border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:10px;color:#4a4a5e;font-weight:900;letter-spacing:1px;">${k}</div>
                            <div style="font-size:16px;font-weight:900;color:#fff;margin-top:4px;">${v||'—'}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="editCard('${cardId}')" style="background:#1a1400;border:1px solid rgba(255,193,7,0.2);color:#ffc107;padding:10px 18px;border-radius:8px;cursor:pointer;font-family:'Poppins',sans-serif;font-weight:900;font-size:13px;letter-spacing:1px;">
                        ✏️ DÜZENLE
                    </button>
                    <button onclick="window.deleteCard('${cardId}')" style="background:rgba(255,23,68,0.08);border:1px solid rgba(255,23,68,0.2);color:#ff4444;padding:10px 18px;border-radius:8px;cursor:pointer;font-family:'Poppins',sans-serif;font-weight:900;font-size:13px;letter-spacing:1px;">
                        🗑️ SİL
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// ══════════════════════════════════════
// KART EKLE / DÜZENLE
// ══════════════════════════════════════
window.toggleLimitedFields = function() {
    const show = document.getElementById('c_is_limited')?.value === 'true';
    const f = document.getElementById('limited_fields');
    if (f) f.style.display = show ? 'flex' : 'none';
};

window.previewCard = function() {
    const name   = document.getElementById('c_name').value;
    const gen    = document.getElementById('c_gen').value;
    const pos    = document.getElementById('c_pos').value;
    const rarity = document.getElementById('c_rarity').value;
    const imgUrl = document.getElementById('c_img').value;
    const hp     = document.getElementById('c_hp').value;
    const hc     = document.getElementById('c_hc').value;

    if (!name || !gen || !imgUrl) {
        showToast('Ad, GEN ve Görsel URL zorunlu!', 'red'); return;
    }

    const rColor = getRarityColor(rarity);
    const preview = document.getElementById('cardPreview');
    preview.innerHTML = `
        <div style="background:#0a0a12;border:1px solid #1a1a24;border-radius:12px;overflow:hidden;border-bottom:3px solid ${rColor};">
            <img src="${imgUrl}" style="width:100%;aspect-ratio:3/4;object-fit:cover;" onerror="this.src='https://placehold.co/300x400/0a0a12/333?text=GÖRSEL+YOK'">
            <div style="padding:12px;text-align:center;">
                <div style="color:${rColor};font-size:10px;font-weight:900;letter-spacing:2px;">${rarity}</div>
                <div style="color:#fff;font-size:16px;font-weight:900;margin:4px 0;">${name}</div>
                <div style="color:#4a4a5e;font-size:12px;">${gen} GEN · ${pos} · ${hp} HP · ${hc} HC</div>
            </div>
        </div>
    `;

    document.getElementById('submitBtn').disabled = false;
    showToast('Önizleme hazır!', 'green');
};

window.pushToDB = async function() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'MÜHÜRLENIYOR...';

    const isLimited = document.getElementById('c_is_limited').value === 'true';
    const cardData = {
        generalId: document.getElementById('c_id').value,
        name:      document.getElementById('c_name').value,
        gen:       Number(document.getElementById('c_gen').value),
        pos:       document.getElementById('c_pos').value,
        value:     document.getElementById('c_value').value,
        hp:        Number(document.getElementById('c_hp').value),
        hc:        Number(document.getElementById('c_hc').value),
        maxSupply: Number(document.getElementById('c_supply').value),
        isLimited,
        limitedNo: isLimited ? Number(document.getElementById('c_limited_no').value) : null,
        series:    document.getElementById('c_series').value,
        nation:    document.getElementById('c_nation').value,
        imageUrl:  document.getElementById('c_img').value,
        rarity:    document.getElementById('c_rarity').value,
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "allCards"), cardData);
        showToast('Kart başarıyla mühürlendi! ✅', 'green');
        setTimeout(() => location.reload(), 1500);
    } catch(e) {
        showToast('Hata: ' + e.message, 'red');
        btn.disabled = false;
        btn.textContent = 'HAVUZA GÖNDER';
    }
};

window.deleteCard = async function(id) {
    if (!confirm("DİKKAT: Bu mühürlü varlık yok edilecek!")) return;
    try {
        await deleteDoc(doc(db, "allCards", id));
        document.getElementById('adminModal')?.remove();
        showToast('Kart silindi.', 'red');
        window.loadCardPool();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

window.editCard = async function(cardId) {
    const docSnap = await getDoc(doc(db, "allCards", cardId));
    if (!docSnap.exists()) return;
    const card = docSnap.data();

    const fields = ['name','gen','pos','value','hp','hc','maxSupply','series','nation','imageUrl'];
    for (const f of fields) {
        const newVal = prompt(`${f}: `, card[f] || '');
        if (newVal === null) return;
        card[f] = isNaN(newVal) || newVal === '' ? newVal : Number(newVal);
    }

    try {
        await updateDoc(doc(db, "allCards", cardId), card);
        document.getElementById('adminModal')?.remove();
        showToast('Kart güncellendi!', 'green');
        window.loadCardPool();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

// ══════════════════════════════════════
// COİN PAKETLERİ
// ══════════════════════════════════════
window.loadCoinPackages = async function() {
    const list = document.getElementById('coinPackagesList');
    if (!list) return;
    list.innerHTML = '<p style="color:#4a4a5e;">Yükleniyor...</p>';
    try {
        const snap = await getDocs(collection(db, "coinPackages"));
        if (snap.empty) { list.innerHTML = '<p style="color:#4a4a5e;">Henüz paket yok.</p>'; return; }
        const pkgs = [];
        snap.forEach(d => pkgs.push({ id: d.id, ...d.data() }));
        pkgs.sort((a,b) => (a.order||0) - (b.order||0));
        list.innerHTML = pkgs.map(pkg => `
            <div class="coin-pkg-row">
                <div style="display:flex;align-items:center;gap:14px;">
                    <span class="coin-pkg-amount">${pkg.amount}</span>
                    <div>
                        <div style="color:#fff;font-weight:700;font-size:13px;">HAS COIN</div>
                        <div class="coin-pkg-price">${pkg.price} · Sıra: ${pkg.order||'—'}</div>
                    </div>
                </div>
                <div class="coin-pkg-actions">
                    <button onclick="window.editCoinPackage('${pkg.id}',${pkg.amount},'${pkg.price}',${pkg.order||0})"
                        style="background:#12121e;border:1px solid #222;color:#ffc107;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:'Poppins',sans-serif;">
                        DÜZENLE
                    </button>
                    <button onclick="window.deleteCoinPackage('${pkg.id}')"
                        style="background:#12121e;border:1px solid rgba(255,23,68,0.2);color:#ff4444;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:'Poppins',sans-serif;">
                        SİL
                    </button>
                </div>
            </div>
        `).join('');
    } catch(e) { list.innerHTML = '<p style="color:#ff4444;">Yükleme hatası!</p>'; }
};

window.addCoinPackage = async function() {
    const amount = Number(document.getElementById('cp_amount').value);
    const price  = document.getElementById('cp_price').value.trim();
    const order  = Number(document.getElementById('cp_order').value) || 99;
    if (!amount || !price) { showToast('Miktar ve fiyat zorunlu!', 'red'); return; }
    try {
        await addDoc(collection(db, "coinPackages"), { amount, price, order, createdAt: new Date() });
        ['cp_amount','cp_price','cp_order'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
        showToast('Paket eklendi!', 'green');
        window.loadCoinPackages();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

window.deleteCoinPackage = async function(id) {
    if (!confirm("Bu paketi silmek istediğine emin misin?")) return;
    try {
        await deleteDoc(doc(db, "coinPackages", id));
        window.loadCoinPackages();
        showToast('Paket silindi.', 'red');
    } catch(e) { showToast('Silme hatası: ' + e.message, 'red'); }
};

window.editCoinPackage = function(id, amount, price, order) {
    const newAmount = prompt("Yeni HC miktarı:", amount);
    if (newAmount === null) return;
    const newPrice = prompt("Yeni fiyat (örn: 99.99 TL):", price);
    if (newPrice === null) return;
    const newOrder = prompt("Sıra numarası:", order);
    if (newOrder === null) return;
    updateDoc(doc(db, "coinPackages", id), {
        amount: Number(newAmount), price: newPrice.trim(), order: Number(newOrder)
    }).then(() => { showToast('Güncellendi!', 'green'); window.loadCoinPackages(); })
      .catch(e => showToast('Hata: ' + e.message, 'red'));
};

window.seedDefaultPackages = async function() {
    if (!confirm("Varsayılan 6 coin paketi Firebase'e eklensin mi?")) return;
    const defaults = [
        { amount: 60,   price: '19.99 TL',  order: 1 },
        { amount: 150,  price: '44.99 TL',  order: 2 },
        { amount: 380,  price: '99.99 TL',  order: 3 },
        { amount: 720,  price: '189.99 TL', order: 4 },
        { amount: 1850, price: '449.99 TL', order: 5 },
        { amount: 3000, price: '699.99 TL', order: 6 },
    ];
    try {
        for (const pkg of defaults) await addDoc(collection(db, "coinPackages"), { ...pkg, createdAt: new Date() });
        showToast('6 varsayılan paket eklendi!', 'green');
        window.loadCoinPackages();
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

// ══════════════════════════════════════
// LİNK ARAÇLARI
// ══════════════════════════════════════
window.fixAllLinks = async function() {
    function toRaw(url) {
        if (!url || !url.includes("github.com")) return url;
        return url.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/").replace("?raw=true", "");
    }
    try {
        let fixed = 0;
        for (const col of ['allCards', 'userCards']) {
            for (const d of (await getDocs(collection(db, col))).docs) {
                const url = d.data().imageUrl || "";
                const fixed_url = toRaw(url);
                if (fixed_url !== url) { await updateDoc(doc(db, col, d.id), { imageUrl: fixed_url }); fixed++; }
            }
        }
        showToast(`${fixed} link düzeltildi! ✅`, 'green');
    } catch(e) { showToast('Hata: ' + e.message, 'red'); }
};

window.cleanBrokenCards = async function() {
    if (!confirm("Görseli yüklenemeyen kartlar silinsin mi?")) return;
    showToast('Bu özellik yakında eklenecek.', 'gold');
};

// ══════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginBtn')?.addEventListener('click', window.verifyPin);
    document.getElementById('adminPin')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') window.verifyPin();
    });
});
