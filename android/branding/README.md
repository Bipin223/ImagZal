# Android branding sources

These are the editable sources for the launcher icon and splash mark.

| File | Use |
| --- | --- |
| `icon-1024.png` | Full icon preview (dark rounded tile) |
| `icon-foreground-1024.png` | Transparent Z mark for Android's adaptive icon |

## Applying a new icon

1. Replace `icon-foreground-1024.png` with your new transparent mark (keep it inside the central safe area), and optionally replace `icon-1024.png`.
2. In Android Studio, right-click `android/app/src/main/res` → **New → Image Asset**.
3. Set:
   - **Foreground layer:** `android/branding/icon-foreground-1024.png`
   - **Background layer:** Color `#151515`
   - **Legacy icon:** the generated preview (or `icon-1024.png`)
4. Finish — the wizard writes every `mipmap-*` density.

Alternatively, replace the existing files under `android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/` directly:

- `ic_launcher.png`
- `ic_launcher_round.png`
- `ic_launcher_foreground.png` (adaptive foreground)

The splash background and icon are set in
`android/app/src/main/res/values/styles.xml`
(`windowSplashScreenBackground`, `windowSplashScreenAnimatedIcon`).

After changing icons, rebuild:

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```
