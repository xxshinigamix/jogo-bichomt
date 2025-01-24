// Nome do cache (você pode mudar se quiser)
const CACHE_NAME = 'jogo-bicho-cache-v1';
// Lista de arquivos que deseja armazenar em cache
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/script.js',

  // inclua o resto das páginas ou assets que precisar
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Faz o download de todos os arquivos
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Quando requisitar algo, tentamos primeiro o cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Se existir em cache, retorna do cache;
      // caso contrário, busca da rede
      return response || fetch(event.request);
    })
  );
});
