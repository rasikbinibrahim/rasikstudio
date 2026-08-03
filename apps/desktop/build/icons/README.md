# apps/desktop/build/icons/

PNG icon set for Linux packaging (AppImage, deb, rpm).

## Required Files

Linux requires a directory of PNG icons at standard sizes:

```
16x16.png
32x32.png
48x48.png
64x64.png
128x128.png
256x256.png
512x512.png
```

electron-builder reads this directory automatically when `linux.icon` points here. All files must be square and named exactly as shown above.
