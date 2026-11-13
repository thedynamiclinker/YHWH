{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodejs pkgs.bash pkgs.file pkgs.xdg-utils pkgs.python3 pkgs.gnumake pkgs.gcc pkgs.pkg-config pkgs.electron pkgs.xorg.xorgserver ];
  shellHook = ''
    export YHWH_ELECTRON=${pkgs.electron}/bin/electron
  '';
}
