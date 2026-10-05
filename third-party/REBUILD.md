# Corresponding source for Windows 1.1.12

The Windows binary distributions use the libvips **web** variant without HEVC or GPL all-variant libraries. The version directories contain every library listed by their versions.json, not only LGPL components.

Extract `build/vips-build-8.18.3.tar.gz` and its fixed MXE snapshot. The upstream `container/base.Dockerfile` identifies the compiler environment. On Linux with Docker or Podman, use:

```sh
./build.sh -t x86_64-w64-mingw32.static --without-prebuilt
```

For 8.15.3, the matching entry point is:

```sh
./build.sh web x86_64 static
```

Use the source tarballs in the version directory as the MXE `pkg` download cache. The included `build/*.mk` and MXE `src/*.mk` define canonical cache filenames, patches, compiler settings and configure options. The group directories distinguish duplicate library versions. Do not build the `all` or HEVC variants for this distribution.

The libimagequant tag `v2.4.1` changed after both DLL builds. Use commit `4e82d9492db228a7a2057c442f7a6eb40508a0eb`, the last commit before their releases, as archived here. libtiff in the 8.18.3 group uses commit `732665c2c8785cec3e1f46ba9908575f0f3a8059`, recorded by the upstream build README. These three tar.gz files were exported with `git archive` and therefore have different archive hashes from the upstream generated tarballs. In the build recipe use the supplied archive filename and SHA256 from `sources.json`; retain the listed fixed code and patches. Other archives match the build recipes byte for byte.

Copy the source cache into the fixed MXE environment and use the included version snapshot, rather than latest upstream. Older Docker scripts may attempt to fetch MXE: provide the included fixed checkout at the revision recorded in `build/commits.json`. Librsvg release tarballs include vendored Rust source. Upstream packaging scripts produce the DLLs and import libraries. sharp addon source is in `javascript/sharp-*/src`; rebuild it with node-gyp and the matching Node ABI and libvips headers.

The application's Release-tag source supplies `npm ci` and `npm run release:win`. It permits replacing and relinking LGPL components and reverse engineering for debugging those changes, as documented in `docs/third-party-licenses.md`. The DLLs are outside `app.asar` and can be replaced with compatible rebuilt DLLs.

jschardet is supplied with its source, distribution files, scripts and LGPL license. JSZip's MIT alternative is selected. Native licenses and copyright texts are in `notices` and in these source archives. Build tools may include licenses not used by the application's runtime. This source package does not contain personal library data, novels, videos or account credentials.
