{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodejs pkgs.git pkgs.python3 pkgs.electron pkgs.xvfb-run ];
  shellHook = ''
    export YHWH_ELECTRON=${pkgs.electron}/bin/electron
  '';
}
