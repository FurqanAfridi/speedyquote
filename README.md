# Speedy Quote Dashboard

Postcard attribution, PIN lookup, and performance analytics for final expense direct mail.

Powered by DevDabs.

## Setup

```bash
npm install
cp env.example.txt .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Import [FurqanAfridi/speedyquote](https://github.com/FurqanAfridi/speedyquote) in Vercel (framework: Other, build: `npm run build`).
2. Add environment variables from `env.example.txt`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RINGBA_LOOKUP_TOKEN` (optional if you create API keys in Settings)
3. Apply SQL in `supabase/migrations/` in the Supabase SQL editor if you have not already.

