{ pkgs ? import <nixpkgs> { config = { allowUnfree = true; android_sdk.accept_license = true; }; } }:
let
  android = (pkgs.androidenv.composeAndroidPackages {
    platformVersions = [ "36" ];
    buildToolsVersions = [ "35.0.0" "36.0.0" ];
    toolsVersion = null;
    cmakeVersions = [];
    includeNDK = false;
    includeEmulator = false;
    includeSystemImages = false;
  }).androidsdk;
in pkgs.mkShell {
  packages = [ pkgs.jdk21 pkgs.nodejs pkgs.gnumake android ];
  JAVA_HOME = pkgs.jdk21.home;
  ANDROID_HOME = "${android}/libexec/android-sdk";
  ANDROID_SDK_ROOT = "${android}/libexec/android-sdk";
  GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${android}/libexec/android-sdk/build-tools/36.0.0/aapt2";
}
