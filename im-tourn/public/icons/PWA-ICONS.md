# PWA Icon Generation Guide

Since you don't have command-line access, here's how to generate the required PNG icons:

## Option 1: Online Tool (Easiest)

1. Go to https://realfavicongenerator.net/
2. Upload the `favicon.svg` file from the `/public/icons/` folder
3. Configure the settings (the defaults work well)
4. Download the generated package
5. Extract and copy the icons to `/public/icons/`

## Option 2: Use an Online SVG to PNG Converter

1. Go to https://svgtopng.com/ or https://cloudconvert.com/svg-to-png
2. Upload `favicon.svg`
3. Generate these sizes and save them to `/public/icons/`:
   - icon-72x72.png
   - icon-96x96.png
   - icon-128x128.png
   - icon-144x144.png
   - icon-152x152.png
   - icon-192x192.png
   - icon-384x384.png
   - icon-512x512.png

## Option 3: Use the Placeholder Icons Below

Until you generate proper icons, create simple colored square PNGs as placeholders.
The PWA will still work, just with basic icons.

## Required Icon Sizes

| Size | Purpose |
|------|---------|
| 72x72 | Android Chrome |
| 96x96 | Android Chrome |
| 128x128 | Chrome Web Store |
| 144x144 | Windows tiles |
| 152x152 | iPad Retina |
| 192x192 | Android Chrome, Apple |
| 384x384 | Android Chrome |
| 512x512 | Android Chrome splash |

## Testing Your PWA

After deploying:

1. Open Chrome DevTools (F12)
2. Go to "Application" tab
3. Click "Manifest" to verify it's loading
4. Click "Service Workers" to verify registration
5. Use "Lighthouse" tab to audit PWA compliance

## Installing the App

**On Android Chrome:**
- Visit your site
- Tap the menu (3 dots)
- Tap "Add to Home Screen" or "Install App"

**On iOS Safari:**
- Visit your site
- Tap the Share button
- Tap "Add to Home Screen"

**On Desktop Chrome:**
- Visit your site
- Click the install icon in the address bar (or menu > "Install I'm Tourn")
