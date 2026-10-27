import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': {
	target: 'http://localhost:8787',
	configure: proxy => proxy.on('proxyReq', (proxyReq, req) => {
		if (req.headers.origin) proxyReq.setHeader('host', new URL(req.headers.origin).host);
	}),
} } } });
