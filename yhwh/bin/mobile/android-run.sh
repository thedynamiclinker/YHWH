#!/bin/sh
set -eu

adb=$1
shift
if ! command -v "$adb" >/dev/null; then
    printf '%s\n' 'adb is required. Install Android platform-tools or set ADB to the adb executable.' >&2
    exit 1
fi
if ! serial=$("$adb" get-serialno) || [ -z "$serial" ] || [ "$serial" = unknown ] ||
    ! state=$("$adb" -s "$serial" get-state) || [ "$state" != device ]; then
    printf '%s\n' 'Cannot reach an authorized Android device. Check adb devices -l and set ANDROID_SERIAL if needed.' >&2
    exit 1
fi

"$@"
"$adb" -s "$serial" install -r var/tmp/yhwh/mobile/yhwh-debug.apk
result=$("$adb" -s "$serial" shell am start -S -W -n com.thedynamiclinker.yhwh/.MainActivity) || {
    printf '%s\n' "$result" >&2
    exit 1
}
printf '%s\n' "$result"
if ! printf '%s\n' "$result" | grep -q '^Status: ok[[:space:]]*$'; then
    printf '%s\n' 'Android could not confirm the launch. Check adb logcat -b crash -d.' >&2
    exit 1
fi
