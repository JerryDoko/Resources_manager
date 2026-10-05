# Third-Party Distribution Notes

Resources Manager's original source is MIT licensed. Third-party software,
models, documents, fonts, and user media are NOT relicensed under MIT.
The author has authorized the original code ported from their local Tingye
project; this does not relicense Tingye's third-party dependencies.

## Included Desktop Components

- Electron: MIT, plus Chromium and multimedia dependency notices. The full
  Electron LICENSE and LICENSES.chromium.html are included in app licenses.
- Node.js: MIT, with the complete upstream LICENSE (including dependencies).
- JavaScript modules: original package license and notice files are collected
  from the actual standalone server into licenses/npm. A versioned inventory
  is generated as licenses/dependencies.json. No claim of a complete security
  audit or patent clearance is made.
- jschardet: LGPL-2.1-or-later. Its complete installed source package is included
  in the release's third-party source bundle. The public application source and
  rebuild instructions allow replacing the encoding library and rebuilding.
- sharp: Apache-2.0. The shared libvips binary and its dependencies retain their
  individual licenses, including LGPL-3.0-or-later and MPL-2.0. The upstream
  composite notice is retained. Corresponding versioned source download
  instructions and build scripts accompany the binary; the source bundle is
  distributed alongside the release. Replacement of the shared library and
  reverse engineering for debugging modifications to LGPL components are
  permitted. This app adds no contractual prohibition on either activity.
- Fonts: this release uses installed system fonts. No Google font files are
  redistributed by this version.

## User-Installed Components (Not Included)

Speech Python, sherpa-onnx, Kokoro weights, voices, lexicons, and eSpeak data
are not included in the public app. Installation requires a deliberate user
action. These components keep their own licenses. In particular, the 1.13.8
speech stack must not be described as entirely Apache licensed:
https://github.com/k2-fsa/sherpa-onnx/issues/3731

Declarative web extensions are independently obtained by users, disabled by
default, scoped to an explicit HTTPS origin list, and stored per workspace.
An extension publisher's rights declaration is not independent verification
of permission. Do not use extensions to bypass authentication, paywalls,
DRM, CAPTCHA or source terms. Moving a feature into a plugin is not legal
clearance for copying or distributing copyrighted works.

## Media and Historical Releases

No books, films, comics, screenshots containing third-party works, or personal
library databases are included in this release. The project icon and synthetic
test fixtures are retained; artwork provenance is not independently certified.
Previous screenshots have been
removed from the current source tree, not from existing Git history or old
release assets. Copyright of user-imported media remains with its owners.

## Build-Time Dependencies

Build tools keep their own package licenses. Only runtime dependencies are
copied to the desktop app. When building another platform or changing dependency
versions, regenerate the notices and corresponding source materials; do not
reuse another platform's source inventory.
