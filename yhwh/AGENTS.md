# YHWH application changes

All new features should be added to all versions of the app, including Android
and iOS, to the extent possible and practical. Prefer shared implementation so
features and fixes propagate through each platform's normal build.

Read [src/yhwh-mobile/README.md](src/yhwh-mobile/README.md) for the platform
boundary and parity requirements. Document any practical platform limitation
there and expose it honestly in the app. Preserve ordinary file formats and
explicit saves with protection against overwriting concurrent edits.
