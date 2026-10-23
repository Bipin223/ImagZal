# ImagZal

Small browser tools for images and PDFs, built and maintained by [Bipin Rizal](https://bipin-rijal.vercel.app).

ImagZal converts images, turns PDF pages into images, and combines photos into a PDF. Everything runs in the browser — no uploads, no accounts and no server.

## Tools

- **Image converter** — PNG, JPG, WEBP, AVIF, TIFF, BMP and ICO output. Batch conversion and a ZIP download.
- **PDF to image** — every PDF page is rendered as a separate PNG, JPG or WEBP image.
- **Image to PDF** — combine photos into one PDF, with A4, US Letter or image-sized pages.
- **Image studio**
  - Compress to a target file size (JPG or WEBP, batch).
  - Resize or crop, with fit/cover modes.
  - Watermark text in any corner, centre or tiled.
  - Inspect and strip EXIF/GPS metadata.
  - Generate a full favicon pack (PNGs, ICO and web manifest) as a ZIP.
  - Passport photo sheets (Nepal 35 × 45 mm or US 2 × 2 in) on 4 × 6 or A4.
  - Photo collages with configurable columns, gap and width.
- **PDF studio**
  - Merge PDFs in a chosen order.
  - Split or extract page ranges into one PDF or separate files.
  - Organise pages: reorder, rotate 90° and delete.
  - Compress by rebuilding pages as smaller images (rasterises the PDF).
  - Add a diagonal watermark and/or page numbers.
  - Extract the text layer to `.txt`.
  - Flatten all pages into one tall PNG.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm run build
```

## Deploy

Pushes to `main` build the site and deploy it to GitHub Pages at
<https://bipin223.github.io/ImagZal/> using `.github/workflows/deploy.yml`.

## Android app

The app also builds as an offline Android app with Capacitor — all web assets are bundled in the APK, so no connection is needed after installing.

```bash
npm install
npm run build          # default base, not build:pages
npx cap sync android
cd android
./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
A local build needs JDK 21 and Android SDK 36.

Inside the Android app, converted files open the system **share/save sheet** — pick Files, Drive, or any other app to keep them. The APK is debug-signed, so it installs by sideloading (allow installs from your file manager).

## Notes

- HEIC and TIFF files are decoded locally with `heic2any` and `UTIF`.
- AVIF output is available when the browser provides an encoder.
- GIF input uses the first frame.
- PDF pages are rendered with `pdf.js`; PDF files are written with `jsPDF`.
- Fonts are bundled and the app makes no network requests after loading.
- The intro animation plays once per session (use **Replay intro** in the footer, or add `?intro` to the URL, to watch it again) and is skipped when the system prefers reduced motion.
- The theme toggle follows the system colour scheme until you pick one, then remembers your choice.
- Files can be dropped or pasted (Ctrl/⌘ + V) into the active tool.
- The production build is installable and works offline after the first visit; heavy PDF libraries load only when you open a PDF tool.

## Author

Bipin Rizal · [GitHub](https://github.com/Bipin223) · [Portfolio](https://bipin-rijal.vercel.app)
