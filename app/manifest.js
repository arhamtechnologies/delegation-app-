export default function manifest() {
  return {
    name: 'Delegation',
    short_name: 'Delegation',
    description: 'Task delegation and follow-up',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f5f6f7',
    theme_color: '#ffffff',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
