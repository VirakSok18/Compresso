# Ultra AVIF Squeezer (Vercel-Ready Web App)

A 100% free, client-side web application that squeezes photos by up to **90% - 95%** using AVIF.

## Highlights
- **100% Free Hosting on Vercel:** Zero server compute costs. Vercel only serves the static HTML/JS files.
- **No Upload Limits:** Because compression happens directly inside the user's browser, users can compress photos without ever hitting Vercel's 4.5 MB serverless limit.
- **Privacy First:** Photos never touch any server.
- **All Formats:** Supports iPhone `.heic`, `.jpg`, `.png`, and `.webp`.
- **95% Size Squeeze:**
  - Auto-downscales 48MP/12MP photos to crisp 2560px (2K).
  - Strips hidden EXIF/GPS metadata.
  - Compresses to AVIF at optimal 50% quality.
- **ZIP Download:** Allows 1-click batch download of all compressed files.

---

## How to Test Locally
You can double-click `index.html` to open it in your browser, or run:

```bash
cd d:\Ideas\avif-web-app
npx serve .
```

---

## How to Deploy to Vercel (Free)

### Option 1: Via Vercel CLI
```bash
cd d:\Ideas\avif-web-app
npx vercel
```

### Option 2: Via GitHub (Recommended)
1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Select your GitHub repository and click **Deploy**.
4. You're live with an instant public URL!

