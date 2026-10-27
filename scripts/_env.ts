try { (process as any).loadEnvFile('.env'); } catch { /* .env is optional; real environment variables win */ }
