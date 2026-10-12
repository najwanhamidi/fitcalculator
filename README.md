# ⚡ FitSync Mobile (iPhone 15 Pro Max & GitHub Pages)

FitSync Mobile is a **100% client-side** web application designed to run smoothly in Safari on **iPhone 15 Pro Max** and any modern desktop or mobile browser.

Because it has **zero server dependencies** and processes binary `.fit` files directly in JavaScript, you can host it **for free on GitHub Pages** or run it locally over Wi-Fi.

---

## 🚀 How to Host on GitHub Pages (Step-by-Step)

Follow these simple steps to host this app on GitHub Pages in under 2 minutes:

### 1. Create a GitHub Repository
1. Log in to [GitHub](https://github.com).
2. Click the **+** icon in the top right and select **New repository**.
3. Name your repository (for example: `fitsync` or `fitsync-mobile`).
4. Set visibility to **Public** (required for free GitHub Pages).
5. Click **Create repository**.

### 2. Upload Files to the Repository
You can upload the files using GitHub Web or Git CLI:
- **Via GitHub Web Interface**:
  1. In your newly created repository page, click **uploading an existing file**.
  2. Drag and drop all the files from this `FitSync_Mobile` folder:
     - `index.html`
     - `style.css`
     - `fit_engine.js`
     - `app.js`
     - `manifest.json`
     - `README.md`
  3. Click **Commit changes**.
- **Via Git Command Line**:
  ```bash
  cd "d:\Google Drive\My Drive\Misc\Lari\FitSync_Mobile"
  git init
  git add .
  git commit -m "Initial commit of FitSync Mobile"
  git branch -M main
  git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
  git push -u origin main
  ```

### 3. Enable GitHub Pages
1. In your GitHub repository, go to **Settings** (top tab).
2. On the left sidebar, click **Pages**.
3. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`.
   - **Branch**: Select `main` (or `master`) and folder `/(root)`.
4. Click **Save**.
5. Wait ~60 seconds. Refresh the page to see your live URL:
   `https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/`

### 4. Install on iPhone 15 Pro Max (Add to Home Screen)
1. Open Safari on your iPhone 15 Pro Max and navigate to your GitHub Pages URL.
2. Tap the Safari **Share button** (square with upward arrow at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.
5. FitSync Mobile is now installed as a fullscreen native-like app on your home screen with offline capability!

---

## 📶 Quick Local Wi-Fi Testing (No GitHub Required)

If you want to test immediately on your iPhone over local Wi-Fi without uploading to GitHub:
1. Double-click `Launch_On_iPhone.bat` (or run `python serve_mobile.py`).
2. Make sure your iPhone is connected to the same Wi-Fi network.
3. Open Safari on iPhone and navigate to the displayed URL (e.g. `http://192.168.x.x:8085`).

---

## 🌟 Key Features

1. **iPhone 15 Pro Max Optimization**:
   - Dynamic Island safe area (`env(safe-area-inset-top)`).
   - Home indicator safe area (`env(safe-area-inset-bottom)`).
   - Touch targets $\ge 44\text{px}$ and input font sizes $\ge 16\text{px}$ to prevent iOS Safari auto-zooming.
   - iOS Web Share API: One tap shares `New.tcx` or `New_gps.fit` directly to the **Zepp App**, **Strava**, or **Files**!

2. **Dual Running Structure Modes**:
   - **🔁 Tab 1: Structured Repeats**:
     - Quick 1-tap presets (e.g. 3×10m @ 13.7 km/h, 5×3m @ 14.2 km/h, etc.).
     - Warm up duration & speed/pace.
     - Repeats count, work duration & speed/pace, recovery duration & speed/pace.
     - Cool down speed/pace & auto target distance calculator.
   - **📋 Tab 2: Manual Segments (Intervals & Progression)**:
     - Add or remove segments at will (`+ Add Segment`, `+ Add Pair`, `🗑️ Delete`).
     - **📈 Progression Helper**: Automatically generates stepped intervals (e.g. 11.0 &rarr; 14.0 km/h with custom steps and recoveries).
     - **⚡ Auto-Calculate Final Segment**: Automatically calculates the final segment's duration based on your target distance ($D_{\text{rem}} = D_{\text{target}} - \sum D_{\text{prior}}$).

3. **Leading Standstill Cleaner**:
   - Toggle: *"Remove all leading records of < 0.3 m/s (standstill before start)"*.
   - Removes all contiguous records before you start moving.

4. **Realistic 400m Olympic Track GPS**:
   - Synthesizes realistic 400m stadium track coordinates (two straightaways of 84.39m + two semicircle curves of radius 36.80m = 400.0m perimeter).

5. **Universal Output Formats**:
   - `New.tcx`: Recommended for Zepp App and Strava (includes laps, GPS trackpoints, heart rate, cadence, speed).
   - `New_gps.fit`: Garmin FIT binary format with GPS coordinates.
   - `New.fit`: Clean indoor FIT binary format.
   - `New_indoor.tcx`: Indoor running TCX without GPS coordinates.
   - `New.gpx`: Standard GPX 1.1 format with track extensions.
   - `New.csv`: FitCSVTool compatible CSV.
   - `📦 Download All (.ZIP)`: One-tap download of all files.

6. **Saved Workout Profiles**:
   - Save custom workouts directly to browser `localStorage`.
   - Export and import workout profiles as `.json` files.
