# ImagZal

Small browser tools for images and PDFs, built and maintained by [Bipin Rizal](https://bipin-rijal.vercel.app).

ImagZal converts images, turns PDF pages into images, and combines photos into a PDF. Everything runs in the browser — no uploads, no accounts and no server.

## Tools

- **Image converter** — PNG, JPG, WEBP, AVIF, TIFF, BMP and ICO output. Batch conversion and a ZIP download.
- **PDF to image** — every PDF page is rendered as a separate PNG, JPG or WEBP image.
- **Image to PDF** — combine photos into one PDF, with A4, US Letter or image-sized pages.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm run build
```

## Notes

- HEIC and TIFF files are decoded locally with `heic2any` and `UTIF`.
- AVIF output is available when the browser provides an encoder.
- GIF input uses the first frame.
- PDF pages are rendered with `pdf.js`; PDF files are written with `jsPDF`.
- Fonts are bundled and the app makes no network requests after loading.

## Author

Bipin Rizal · [GitHub](https://github.com/Bipin223) · [Portfolio](https://bipin-rijal.vercel.app)
