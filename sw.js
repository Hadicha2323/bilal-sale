// ================================================================
// Bilal-sale POS - Service Worker
// Version: v3 (har deploy'da oshiring)
// ================================================================

const CACHE_NAME = 'bilal-sale-v3';

// Keshga saqlanadigan fayllar
const urlsToCache = [
    '/',
    '/index.html',
    '/config.js',
    '/qz-print.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// ================================================================
// INSTALL — Service Worker o'rnatilganda
// ================================================================
self.addEventListener('install', event => {
    console.log('🔧 Service Worker o\'rnatilmoqda... v3');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Keshga saqlanmoqda...');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ Service Worker o\'rnatildi');
                // Yangi Service Worker darhol faollashtirilsin
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ Kesh xatosi:', err);
            })
    );
});

// ================================================================
// ACTIVATE — Yangi Service Worker faollashganda
// ================================================================
self.addEventListener('activate', event => {
    console.log('🚀 Service Worker faollashtirilmoqda... v3');
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Eski keshlarni o'chirish
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Eski kesh o\'chirilmoqda:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker faollashtirildi');
                // Barcha ochiq sahifalarni darhol boshqarish
                return self.clients.claim();
            })
    );
});

// ================================================================
// FETCH — So'rovlarni ushlash
// ================================================================
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // ⚠️ Supabase API — har doim tarmoqdan (keshlamaslik)
    if (url.includes('supabase.co')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // ⚠️ QZ Tray WebSocket — o'tkazib yuborish
    if (url.includes('localhost:8182') || url.startsWith('ws://')) {
        return;
    }

    // ⚠️ Chrome extension va boshqa tashqi — o'tkazib yuborish
    if (!url.startsWith('http')) {
        return;
    }

    // 📦 Statik fayllar — "network first" strategiya
    // (yangi versiyani olish uchun avval tarmoqqa so'rov yuboriladi)
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Muvaffaqiyatli bo'lsa — keshga saqlash
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Tarmoq ishlamasa — keshdan olish
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Hech narsa topilmasa — index.html
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

// ================================================================
// MESSAGE — Sahifadan xabar qabul qilish
// ================================================================
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        console.log('⚡ Darhol faollashish buyrug\'i olindi');
        self.skipWaiting();
    }
    
    if (event.data === 'CLEAR_CACHE') {
        console.log('🗑️ Keshni tozalash buyrug\'i olindi');
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
        });
    }
});

console.log('📱 Bilal-sale Service Worker yuklandi - v3');