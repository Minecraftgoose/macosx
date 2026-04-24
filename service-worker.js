// macOS Web PWA Service Worker - 纯动态缓存方案（修复版）
const CACHE_NAME = 'macos-web-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Dynamic cache opened');
            return cache.addAll(['/', '/index.html']);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    const url = new URL(event.request.url);
    const pathname = url.pathname;
    
    // 调试：打印所有请求，看看 apps 请求长什么样
    if (pathname.includes('apps')) {
        console.log('[SW] Apps request:', pathname, 'from', event.request.referrer);
    }
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }
                
                const responseToCache = networkResponse.clone();
                
                // 更宽松的静态资源判断
                const isStaticResource = 
                    // 常见扩展名
                    /\.(webp|png|jpe?g|gif|svg|css|js|woff2?|ttf|eot|ico|html|json)$/i.test(pathname) ||
                    // apps 目录下的任何文件（包括没有扩展名的）
                    pathname.includes('/apps/') ||
                    pathname.includes('apps/');
                
                if (isStaticResource) {
                    console.log('[SW] Caching:', pathname);
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                
                return networkResponse;
            }).catch((err) => {
                console.warn('[SW] Network failed for:', pathname, err.message);
                return cachedResponse;
            });
            
            return cachedResponse || fetchPromise;
        })
    );
});
